<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// v2: HR, Accountant and General Manager agents that message staff by email and chat, track requests and follow up.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ai_agents', function (Blueprint $t) {
            $t->string('mailbox')->nullable()->after('color'); // reply-to address people can answer, e.g. hr@figuraid.com
            $t->string('kind', 10)->default('public')->after('mailbox'); // public (customer-facing) | staff (internal colleague)
        });
        Schema::table('tasks', function (Blueprint $t) {
            $t->unsignedTinyInteger('reminder_count')->default(0);
            $t->timestamp('last_reminded_at')->nullable();
            $t->timestamp('escalated_at')->nullable();
        });
        Schema::table('chat_channels', fn (Blueprint $t) => $t->string('agent_key', 20)->nullable()->index());
        Schema::create('staff_points', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->string('period_month', 7);
            $t->integer('points');
            $t->json('breakdown');
            $t->unsignedSmallInteger('rank')->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'period_month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_points');
        Schema::table('chat_channels', fn (Blueprint $t) => $t->dropColumn('agent_key'));
        Schema::table('tasks', fn (Blueprint $t) => $t->dropColumn(['reminder_count', 'last_reminded_at', 'escalated_at']));
        Schema::table('ai_agents', fn (Blueprint $t) => $t->dropColumn(['mailbox', 'kind']));
    }
};
