<?php

namespace App\Services;

use App\Domain\Money;
use App\Models\SocialPost;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/** Zara drafts social posts; a person approves; scheduled posts publish to Facebook/Instagram. LinkedIn/X: copy & post manually. */
class SocialService
{
    public function draft(string $unitId, string $platform, string $brief): SocialPost
    {
        $r = app(AiGateway::class)->complete(Agents::agent('social')->brief."\nPlatform: $platform. Facts you may use:\n".Agents::knowledge($brief, $unitId, 3)."\nNo prices, no figures that are not in the facts, no claims about customers. Reply with the post text only.", AiGateway::fence($brief));

        return SocialPost::create(['unit_id' => $unitId, 'platform' => $platform, 'body' => trim($r['text']), 'status' => 'pending_approval', 'agent_key' => 'social']);
    }

    public function approve(SocialPost $p, User $by): void
    {
        if ($p->created_by_id && $p->created_by_id === $by->id && ! $by->isRole('super_admin')) {
            throw new RuntimeException('Another person must approve this post.');
        }
        $p->forceFill(['status' => 'approved', 'approved_by_id' => $by->id, 'scheduled_at' => $p->scheduled_at ?? now()])->save();
    }

    public function publishDue(): int
    {
        $n = 0;
        foreach (SocialPost::where('status', 'approved')->whereIn('platform', ['facebook', 'instagram'])->where('scheduled_at', '<=', now())->get() as $p) {
            try {
                $id = $p->platform === 'facebook' ? $this->facebook($p) : $this->instagram($p);
                $p->forceFill(['status' => 'published', 'external_id' => $id, 'published_at' => now(), 'error' => null])->save();
                $n++;
            } catch (\Throwable $e) {
                $p->forceFill(['status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 190)])->save();
            }
        }

        return $n;
    }

    private function facebook(SocialPost $p): string
    {
        $page = config('services.meta.page_id');
        $token = config('services.meta.page_token');
        if (! $page || ! $token) {
            throw new RuntimeException('Facebook page not configured');
        }
        $r = $p->image_url
            ? Http::post("https://graph.facebook.com/v21.0/$page/photos", ['url' => $p->image_url, 'caption' => $p->body, 'access_token' => $token])
            : Http::post("https://graph.facebook.com/v21.0/$page/feed", ['message' => $p->body, 'access_token' => $token]);
        if (! $r->successful()) {
            throw new RuntimeException('Facebook '.$r->status().' '.$r->json('error.message'));
        }

        return (string) ($r->json('post_id') ?? $r->json('id'));
    }

    private function instagram(SocialPost $p): string
    {
        $ig = config('services.meta.ig_user_id');
        $token = config('services.meta.page_token');
        if (! $ig || ! $token || ! $p->image_url) {
            throw new RuntimeException('Instagram needs META_IG_USER_ID and a public image URL');
        }
        $c = Http::post("https://graph.facebook.com/v21.0/$ig/media", ['image_url' => $p->image_url, 'caption' => $p->body, 'access_token' => $token]);
        if (! $c->successful()) {
            throw new RuntimeException('Instagram '.$c->status());
        }
        $r = Http::post("https://graph.facebook.com/v21.0/$ig/media_publish", ['creation_id' => $c->json('id'), 'access_token' => $token]);
        if (! $r->successful()) {
            throw new RuntimeException('Instagram publish '.$r->status());
        }

        return (string) $r->json('id');
    }
}
