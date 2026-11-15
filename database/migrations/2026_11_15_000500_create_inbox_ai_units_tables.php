<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Omnichannel inbox, tickets, AI agents & usage, knowledge base, Academy, procurement, docs, monitoring, surveys.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversations', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->constrained('business_units');
            $t->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $t->string('channel', 12); // whatsapp instagram facebook email webchat teams phone
            $t->string('channel_account', 60)->nullable(); // which number/page/mailbox
            $t->string('external_thread_id', 191)->nullable()->index();
            $t->string('subject')->nullable();
            $t->string('status', 10)->default('open'); // open pending resolved
            $t->string('category', 20)->nullable(); // sales support billing complaint spam
            $t->string('priority', 8)->default('normal');
            $t->foreignUlid('assignee_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('agent_key', 20)->nullable(); // AI agent handling it
            $t->timestamp('last_customer_message_at')->nullable();
            $t->timestamp('first_response_at')->nullable();
            $t->timestamp('sla_due_at')->nullable()->index();
            $t->unsignedTinyInteger('escalation_level')->default(0); // 0 none 1 reminder 2 reassigned 3 unit manager 4 ops manager
            $t->text('resolution_note')->nullable();
            $t->timestamp('resolved_at')->nullable();
            $t->timestamps();
            $t->index(['status', 'sla_due_at']);
        });
        Schema::create('messages', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('conversation_id')->constrained()->cascadeOnDelete();
            $t->string('direction', 3); // in out
            $t->string('author_type', 8); // contact staff agent system
            $t->foreignUlid('author_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('agent_key', 20)->nullable();
            $t->text('body');
            $t->json('attachments')->nullable();
            $t->string('external_id', 191)->nullable()->unique();
            $t->string('delivery', 10)->default('sent'); // queued sent delivered read failed draft
            $t->boolean('needs_approval')->default(false);
            $t->timestamps();
        });

        Schema::create('tickets', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->constrained('business_units');
            $t->string('number', 20)->unique();
            $t->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignUlid('conversation_id')->nullable()->constrained()->nullOnDelete();
            $t->string('subject');
            $t->text('body')->nullable();
            $t->string('status', 10)->default('open');
            $t->string('priority', 8)->default('normal');
            $t->foreignUlid('assignee_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('external_ref', 40)->nullable(); // WHMCS ticket id
            $t->timestamp('due_at')->nullable();
            $t->timestamp('resolved_at')->nullable();
            $t->timestamps();
        });

        Schema::create('ai_agents', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('key', 20)->unique(); // front_desk analyst support vendor social care email
            $t->string('name', 40); // Ada Kene Femi Dayo Zara Nneka Seyi (editable)
            $t->string('role');
            $t->string('color', 9);
            $t->text('brief'); // role brief / system prompt
            $t->json('units')->nullable();
            $t->json('approval_required')->nullable(); // actions that need a human
            $t->string('status', 10)->default('active'); // active paused
            $t->timestamp('last_active_at')->nullable();
            $t->string('last_action')->nullable();
            $t->timestamps();
        });
        Schema::create('ai_actions', function (Blueprint $t) { // every agent message/action logged + approvals
            $t->ulid('id')->primary();
            $t->string('agent_key', 20)->index();
            $t->string('kind', 30); // reply classify task brief rate_parse post campaign winback birthday
            $t->string('subject_type', 40)->nullable();
            $t->ulid('subject_id')->nullable();
            $t->text('input_summary')->nullable();
            $t->longText('output')->nullable();
            $t->string('status', 12)->default('done'); // done pending_approval approved rejected failed queued
            $t->foreignUlid('decided_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('decided_at')->nullable();
            $t->unsignedTinyInteger('quality_score')->nullable(); // weekly review
            $t->string('provider', 20)->nullable();
            $t->timestamps();
            $t->index(['status', 'created_at']);
        });
        Schema::create('ai_providers', function (Blueprint $t) {
            $t->id();
            $t->string('key', 20)->unique(); // gemini groq openrouter mistral cerebras
            $t->string('name');
            $t->unsignedTinyInteger('priority');
            $t->string('light_model');
            $t->string('heavy_model');
            $t->boolean('is_enabled')->default(true);
            $t->unsignedInteger('daily_limit')->nullable();
            $t->timestamp('cooldown_until')->nullable();
            $t->timestamps();
        });
        Schema::create('ai_usage', function (Blueprint $t) {
            $t->id();
            $t->date('date');
            $t->string('provider', 20);
            $t->string('model', 80);
            $t->string('tier', 5); // light heavy
            $t->unsignedInteger('requests')->default(0);
            $t->unsignedInteger('failures')->default(0);
            $t->unsignedBigInteger('tokens_in')->default(0);
            $t->unsignedBigInteger('tokens_out')->default(0);
            $t->unique(['date', 'provider', 'model', 'tier']);
        });

        Schema::create('kb_articles', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->nullable()->constrained('business_units');
            $t->string('audience', 8)->default('public'); // public (AI may use) internal (staff only)
            $t->string('title');
            $t->string('slug')->unique();
            $t->longText('body');
            $t->json('tags')->nullable();
            $t->string('status', 10)->default('published'); // suggested draft published
            $t->string('suggested_by', 20)->nullable(); // agent key
            $t->timestamps();
        });
        Schema::create('agent_test_cases', function (Blueprint $t) {
            $t->id();
            $t->string('agent_key', 20);
            $t->text('question');
            $t->text('must_include')->nullable();
            $t->text('must_not_include')->nullable();
            $t->boolean('last_passed')->nullable();
            $t->timestamp('last_run_at')->nullable();
            $t->timestamps();
        });

        // Academy
        Schema::create('courses', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('title');
            $t->string('code', 20)->unique();
            $t->decimal('fee', 18, 2)->default(0);
            $t->unsignedSmallInteger('weeks')->default(12);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
        Schema::create('cohorts', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('course_id')->constrained()->cascadeOnDelete();
            $t->string('name');
            $t->date('starts_on');
            $t->date('ends_on')->nullable();
            $t->unsignedSmallInteger('capacity')->default(30);
            $t->foreignUlid('coordinator_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });
        Schema::create('enrolments', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('cohort_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('contact_id')->constrained()->cascadeOnDelete();
            $t->string('status', 12)->default('enrolled'); // applied enrolled completed dropped
            $t->decimal('fee', 18, 2)->default(0);
            $t->decimal('scholarship_pct', 5, 2)->default(0);
            $t->decimal('amount_paid', 18, 2)->default(0);
            $t->string('paystack_reference', 100)->nullable();
            $t->unsignedTinyInteger('attendance_pct')->nullable();
            $t->string('certificate_code', 20)->nullable()->unique();
            $t->timestamp('certificate_issued_at')->nullable();
            $t->timestamps();
            $t->unique(['cohort_id', 'contact_id']);
        });
        Schema::create('class_sessions', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('cohort_id')->constrained()->cascadeOnDelete();
            $t->dateTime('starts_at');
            $t->string('topic');
            $t->timestamps();
        });
        Schema::create('class_attendance', function (Blueprint $t) {
            $t->foreignUlid('class_session_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('enrolment_id')->constrained()->cascadeOnDelete();
            $t->boolean('present');
            $t->primary(['class_session_id', 'enrolment_id']);
        });

        // Procurement
        Schema::create('rfqs', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('number', 20)->unique();
            $t->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignUlid('deal_id')->nullable()->constrained()->nullOnDelete();
            $t->string('title');
            $t->json('items'); // [{name, qty, spec}]
            $t->date('needed_by')->nullable();
            $t->string('status', 12)->default('open'); // open quoting quoted won lost
            $t->foreignUlid('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
        });
        Schema::create('supplier_quotes', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('rfq_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('vendor_id')->constrained();
            $t->decimal('amount', 18, 2);
            $t->string('currency', 3)->default('NGN');
            $t->unsignedSmallInteger('lead_days')->nullable();
            $t->text('notes')->nullable();
            $t->boolean('selected')->default(false);
            $t->timestamps();
        });
        Schema::create('purchase_orders', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('number', 20)->unique();
            $t->foreignUlid('rfq_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignUlid('vendor_id')->constrained();
            $t->decimal('amount', 18, 2);
            $t->string('currency', 3)->default('NGN');
            $t->string('status', 12)->default('draft'); // draft approved sent delivered cancelled
            $t->string('delivery_status', 12)->default('pending'); // pending in_transit delivered
            $t->date('expected_on')->nullable();
            $t->foreignUlid('approved_by_id')->nullable()->constrained('users');
            $t->timestamps();
        });

        // Documents & renewals vault
        Schema::create('documents', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->nullable()->constrained('business_units');
            $t->string('title');
            $t->string('kind', 24); // carrier_agreement ncc_licence domain certificate contract policy other
            $t->foreignUlid('file_id')->nullable()->constrained('stored_files')->nullOnDelete();
            $t->date('expires_on')->nullable()->index();
            $t->unsignedSmallInteger('remind_days_before')->default(30);
            $t->foreignUlid('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('confidentiality', 12)->default('internal');
            $t->timestamps();
        });

        Schema::create('uptime_checks', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('url');
            $t->boolean('is_up')->nullable();
            $t->unsignedSmallInteger('last_status')->nullable();
            $t->unsignedInteger('last_ms')->nullable();
            $t->timestamp('last_checked_at')->nullable();
            $t->timestamp('down_since')->nullable();
            $t->timestamps();
        });

        Schema::create('surveys', function (Blueprint $t) { // CSAT & NPS
            $t->ulid('id')->primary();
            $t->string('kind', 4); // csat nps
            $t->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignUlid('unit_id')->constrained('business_units');
            $t->string('token', 40)->unique();
            $t->unsignedTinyInteger('score')->nullable();
            $t->text('comment')->nullable();
            $t->timestamp('answered_at')->nullable();
            $t->timestamps();
        });

        Schema::create('scheduled_reports', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('name');
            $t->string('report', 30); // revenue pipeline attendance inbox reconciliation
            $t->string('frequency', 8); // daily weekly monthly
            $t->json('recipients');
            $t->foreignUlid('owner_id')->constrained('users');
            $t->timestamp('last_sent_at')->nullable();
            $t->timestamps();
        });

        Schema::create('bookings', function (Blueprint $t) { // booking links
            $t->ulid('id')->primary();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->string('name');
            $t->string('email');
            $t->dateTime('starts_at');
            $t->unsignedSmallInteger('minutes')->default(30);
            $t->text('notes')->nullable();
            $t->string('google_event_id')->nullable();
            $t->timestamps();
        });

        Schema::create('portal_users', function (Blueprint $t) { // customer portal (carriers, hosting, academy)
            $t->ulid('id')->primary();
            $t->foreignUlid('contact_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('carrier_id')->nullable()->constrained()->nullOnDelete();
            $t->string('email')->unique();
            $t->string('password');
            $t->timestamp('last_login_at')->nullable();
            $t->rememberToken();
            $t->timestamps();
        });
        Schema::create('route_requests', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('carrier_id')->constrained()->cascadeOnDelete();
            $t->string('destination');
            $t->string('volume')->nullable();
            $t->decimal('target_rate', 12, 6)->nullable();
            $t->string('status', 10)->default('new');
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['route_requests', 'portal_users', 'bookings', 'scheduled_reports', 'surveys', 'uptime_checks', 'documents', 'purchase_orders', 'supplier_quotes', 'rfqs', 'class_attendance', 'class_sessions', 'enrolments', 'cohorts', 'courses', 'agent_test_cases', 'kb_articles', 'ai_usage', 'ai_providers', 'ai_actions', 'ai_agents', 'tickets', 'messages', 'conversations'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
