<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Whiteboard: a company-wide board where AI colleagues (and HR/managers) tag staff with hashtags — call-outs and kudos.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whiteboard_posts', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('kind', 8)->default('callout'); // callout kudos notice
            $t->string('agent_key', 20)->nullable();
            $t->foreignUlid('author_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignUlid('subject_user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $t->text('body');
            $t->json('hashtags');
            $t->string('source_type', 40)->nullable();
            $t->string('source_id', 40)->nullable();
            $t->string('dedupe_key', 160)->nullable()->unique();
            $t->timestamp('retracted_at')->nullable();
            $t->foreignUlid('retracted_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('retract_reason')->nullable();
            $t->timestamp('expires_at')->nullable()->index();
            $t->timestamps();
            $t->index(['source_type', 'source_id']);
            $t->index(['subject_user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whiteboard_posts');
    }
};
