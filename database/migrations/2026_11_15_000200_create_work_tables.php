<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Work: tasks, playbooks (SOPs), targets, goals, daily reports, announcements, internal chat.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('playbooks', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->constrained('business_units');
            $t->foreignUlid('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('title');
            $t->text('body')->nullable(); // markdown: the how-to staff and AI agents follow
            $t->json('steps')->nullable(); // checklist copied onto generated tasks
            $t->string('frequency', 10)->default('on_demand'); // daily weekly monthly on_demand
            $t->json('weekdays')->nullable(); // ISO 1-7
            $t->unsignedTinyInteger('day_of_month')->nullable();
            $t->string('due_time', 5)->default('17:00');
            $t->string('default_priority', 8)->default('medium');
            $t->date('starts_on')->nullable();
            $t->date('last_generated_on')->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
        Schema::create('playbook_user', function (Blueprint $t) {
            $t->foreignUlid('playbook_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->primary(['playbook_id', 'user_id']);
        });

        Schema::create('tasks', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->nullable()->constrained('business_units');
            $t->string('title');
            $t->text('description')->nullable();
            $t->string('status', 12)->default('todo'); // todo in_progress review done
            $t->string('priority', 8)->default('medium'); // low medium high urgent
            $t->string('origin', 10)->default('team_lead'); // founder team_lead sop ai system
            $t->string('agent_key', 20)->nullable();
            $t->foreignUlid('assignee_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignUlid('creator_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('due_at')->nullable()->index();
            $t->timestamp('completed_at')->nullable();
            $t->string('board_rank', 64)->default('m');
            $t->json('checklist')->nullable(); // [{title, done}]
            $t->json('tags')->nullable();
            $t->foreignUlid('playbook_id')->nullable()->constrained()->nullOnDelete();
            $t->string('playbook_occurrence', 10)->nullable();
            $t->ulid('contact_id')->nullable()->index();
            $t->ulid('deal_id')->nullable()->index();
            $t->ulid('ticket_id')->nullable()->index();
            $t->ulid('conversation_id')->nullable()->index();
            $t->ulid('chat_message_id')->nullable();
            $t->timestamps();
            $t->unique(['playbook_id', 'playbook_occurrence', 'assignee_id']);
            $t->index(['status', 'board_rank']);
        });
        Schema::create('task_comments', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('task_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('author_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('agent_key', 20)->nullable();
            $t->text('body');
            $t->timestamps();
        });

        Schema::create('goals', function (Blueprint $t) { // quarterly OKRs
            $t->ulid('id')->primary();
            $t->string('quarter', 7); // 2026-Q4
            $t->foreignUlid('unit_id')->nullable()->constrained('business_units');
            $t->string('objective');
            $t->foreignUlid('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });
        Schema::create('key_results', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('goal_id')->constrained()->cascadeOnDelete();
            $t->string('title');
            $t->decimal('target', 18, 2);
            $t->decimal('current', 18, 2)->default(0);
            $t->string('unit_label', 20)->nullable();
            $t->timestamps();
        });

        Schema::create('targets', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('key_result_id')->nullable()->constrained()->nullOnDelete();
            $t->date('week_start');
            $t->string('metric', 30); // deals_won leads_contacted tickets_resolved tasks_done custom
            $t->string('label')->nullable();
            $t->decimal('target', 18, 2);
            $t->decimal('achieved', 18, 2)->default(0);
            $t->foreignUlid('set_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['user_id', 'week_start', 'metric', 'label']);
        });

        Schema::create('daily_reports', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->date('date');
            $t->text('done');
            $t->text('blockers')->nullable();
            $t->text('tomorrow')->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'date']);
        });

        Schema::create('announcements', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->nullable()->constrained('business_units');
            $t->foreignUlid('author_id')->constrained('users');
            $t->string('title');
            $t->text('body');
            $t->boolean('pinned')->default(true);
            $t->boolean('requires_ack')->default(false);
            $t->timestamps();
        });
        Schema::create('announcement_reads', function (Blueprint $t) {
            $t->foreignUlid('announcement_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->timestamp('read_at')->useCurrent();
            $t->timestamp('acknowledged_at')->nullable();
            $t->primary(['announcement_id', 'user_id']);
        });

        Schema::create('chat_channels', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('kind', 8); // general unit group direct project
            $t->string('name')->nullable();
            $t->foreignUlid('unit_id')->nullable()->constrained('business_units');
            $t->string('direct_key', 60)->nullable()->unique();
            $t->foreignUlid('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });
        Schema::create('chat_channel_user', function (Blueprint $t) {
            $t->foreignUlid('chat_channel_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->timestamp('last_read_at')->nullable();
            $t->primary(['chat_channel_id', 'user_id']);
        });
        Schema::create('chat_messages', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('chat_channel_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('author_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('agent_key', 20)->nullable(); // AI agents post handovers here
            $t->ulid('parent_id')->nullable();
            $t->text('body')->nullable();
            $t->json('attachments')->nullable(); // [{file_id, name, mime, kind}]
            $t->json('mentions')->nullable();
            $t->json('tags')->nullable();
            $t->boolean('pinned')->default(false);
            $t->timestamp('edited_at')->nullable();
            $t->timestamp('deleted_at')->nullable();
            $t->timestamps();
            $t->index(['chat_channel_id', 'created_at']);
        });
    }

    public function down(): void
    {
        foreach (['chat_messages', 'chat_channel_user', 'chat_channels', 'announcement_reads', 'announcements', 'daily_reports', 'targets', 'key_results', 'goals', 'task_comments', 'tasks', 'playbook_user', 'playbooks'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
