<?php

namespace Tests\Feature;

use Database\Seeders\CoreSeeder;
use Database\Seeders\DemoSeeder;
use Filament\Facades\Filament;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Every screen renders for a Super Admin with demo data. */
class PanelSmokeTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_resource_index_and_create_page_renders(): void
    {
        $this->seed([CoreSeeder::class, DemoSeeder::class]);
        $admin = $this->makeUser('super_admin');
        $this->actingAs($admin);
        $failures = [];
        foreach (Filament::getPanel('app')->getResources() as $resource) {
            foreach (['index', 'create'] as $page) {
                if (! array_key_exists($page, $resource::getPages())) {
                    continue;
                }
                $url = $resource::getUrl($page);
                $res = $this->get($url);
                if ($res->status() !== 200) {
                    $failures[] = "$url → {$res->status()} ".substr(strip_tags((string) ($res->exception?->getMessage() ?? '')), 0, 300);
                }
            }
            $model = $resource::getModel();
            $record = $model::query()->first();
            if ($record && array_key_exists('edit', $resource::getPages())) {
                $res = $this->get($resource::getUrl('edit', ['record' => $record]));
                if ($res->status() !== 200) {
                    $failures[] = $resource::getUrl('edit', ['record' => $record])." → {$res->status()} ".substr((string) ($res->exception?->getMessage() ?? ''), 0, 300);
                }
            }
        }
        foreach (Filament::getPanel('app')->getPages() as $page) {
            $res = $this->get($page::getUrl());
            if ($res->status() !== 200) {
                $failures[] = $page::getUrl()." → {$res->status()} ".substr((string) ($res->exception?->getMessage() ?? ''), 0, 300);
            }
        }
        $this->assertSame([], $failures, implode("\n", $failures));
    }
}
