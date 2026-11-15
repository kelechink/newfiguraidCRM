<?php

namespace App\Models\Concerns;

/**
 * Workflow fields (status, approver, timestamps of decisions, authorship) are not mass-assignable: forms and
 * crafted browser requests cannot set them. Only service code (forceFill / forceCreate) — i.e. the Approve,
 * Send and Pay buttons with their checks — can change them. Authorship columns are filled from the signed-in user.
 */
trait ProtectsWorkflow
{
    public static function bootProtectsWorkflow(): void
    {
        static::creating(function ($m) {
            foreach ($m->creatorColumns ?? [] as $c) {
                if (! $m->getAttribute($c) && auth()->id()) {
                    $m->setAttribute($c, auth()->id());
                }
            }
        });
    }
}
