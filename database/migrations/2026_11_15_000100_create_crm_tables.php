<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Customers: one profile per person/company across Telecom, FigureWeb, Academy and Procurement.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('companies', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('name');
            $t->string('website')->nullable();
            $t->string('country', 80)->nullable();
            $t->string('industry', 80)->nullable();
            $t->foreignUlid('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->softDeletes();
            $t->index('name');
        });

        Schema::create('contacts', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('primary_unit_id')->constrained('business_units');
            $t->foreignUlid('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $t->foreignUlid('company_id')->nullable()->constrained()->nullOnDelete();
            $t->string('first_name', 80)->nullable();
            $t->string('last_name', 80)->nullable();
            $t->string('display_name', 160);
            $t->string('email')->nullable();
            $t->string('email_normalized')->nullable()->index();
            $t->string('phone', 40)->nullable();
            $t->string('phone_e164', 20)->nullable()->index();
            $t->string('whatsapp_id', 20)->nullable();
            $t->string('teams_handle')->nullable();
            $t->date('birthday')->nullable();
            $t->string('lifecycle', 12)->default('lead'); // lead prospect customer churned archived
            $t->unsignedTinyInteger('score')->default(0);
            $t->unsignedTinyInteger('health_score')->nullable();
            $t->decimal('budget', 18, 2)->nullable();
            $t->string('source_channel', 20)->nullable(); // website form chat whatsapp import referral ad email phone
            $t->string('source_detail')->nullable();
            $t->json('tags')->nullable();
            $t->json('destinations')->nullable(); // telecom destinations of interest
            $t->string('utm_source', 100)->nullable();
            $t->string('utm_medium', 100)->nullable();
            $t->string('utm_campaign', 100)->nullable();
            $t->string('referral_code', 20)->nullable();
            $t->string('whmcs_client_id', 20)->nullable()->index();
            $t->timestamp('last_activity_at')->nullable()->index();
            $t->ulid('merged_into_id')->nullable();
            $t->timestamps();
            $t->softDeletes();
            $t->index(['primary_unit_id', 'lifecycle']);
        });

        Schema::create('business_unit_contact', function (Blueprint $t) {
            $t->foreignUlid('contact_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('business_unit_id')->constrained()->cascadeOnDelete();
            $t->primary(['contact_id', 'business_unit_id']);
        });

        Schema::create('pipelines', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->constrained('business_units');
            $t->string('name');
            $t->string('kind', 12)->default('sales'); // sales tender procurement
            $t->unsignedSmallInteger('position')->default(0);
            $t->timestamps();
        });

        Schema::create('pipeline_stages', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('pipeline_id')->constrained()->cascadeOnDelete();
            $t->string('name');
            $t->unsignedSmallInteger('position');
            $t->unsignedTinyInteger('probability')->default(0);
            $t->string('kind', 6)->default('open'); // open won lost
            $t->string('color', 9)->nullable();
            $t->unique(['pipeline_id', 'position']);
        });

        Schema::create('lost_reasons', function (Blueprint $t) {
            $t->id();
            $t->string('label')->unique();
        });

        Schema::create('deals', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->constrained('business_units');
            $t->foreignUlid('pipeline_id')->constrained();
            $t->foreignUlid('stage_id')->constrained('pipeline_stages');
            $t->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignUlid('company_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignUlid('owner_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('title');
            $t->decimal('value', 18, 2)->default(0);
            $t->string('currency', 3)->default('NGN');
            $t->string('status', 6)->default('open'); // open won lost
            $t->string('rank', 64)->default('m'); // fractional board order
            $t->date('expected_close_on')->nullable();
            $t->string('next_action')->nullable();
            $t->date('next_action_on')->nullable();
            $t->json('tags')->nullable();
            $t->string('source', 30)->nullable();
            $t->foreignId('lost_reason_id')->nullable()->constrained('lost_reasons');
            $t->text('lost_note')->nullable();
            $t->timestamp('won_at')->nullable();
            $t->timestamp('lost_at')->nullable();
            $t->timestamps();
            $t->softDeletes();
            $t->index(['stage_id', 'rank']);
        });

        Schema::create('activities', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('contact_id')->nullable()->constrained()->cascadeOnDelete();
            $t->foreignUlid('deal_id')->nullable()->constrained()->cascadeOnDelete();
            $t->foreignUlid('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('agent_key', 20)->nullable(); // AI agent that did it
            $t->string('type', 24); // note call email whatsapp meeting form payment stage teams_log system
            $t->text('summary');
            $t->json('data')->nullable();
            $t->timestamp('occurred_at')->useCurrent()->index();
        });

        Schema::create('lead_forms', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('unit_id')->constrained('business_units');
            $t->string('name');
            $t->string('slug', 80)->unique();
            $t->json('fields');
            $t->foreignUlid('pipeline_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignUlid('stage_id')->nullable()->constrained('pipeline_stages')->nullOnDelete();
            $t->string('consent_text', 500)->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        Schema::create('form_submissions', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('lead_form_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $t->json('data');
            $t->json('accepted')->nullable(); // terms/privacy versions and time (PRD §11a)
            $t->string('ip', 45)->nullable();
            $t->string('user_agent', 300)->nullable();
            $t->json('utm')->nullable();
            $t->timestamp('created_at')->useCurrent();
        });

        Schema::create('consents', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('contact_id')->constrained()->cascadeOnDelete();
            $t->string('channel', 10); // email whatsapp sms
            $t->boolean('granted');
            $t->string('source', 80);
            $t->string('notice_version', 40)->nullable();
            $t->string('ip', 45)->nullable();
            $t->timestamp('created_at')->useCurrent();
            $t->index(['contact_id', 'channel']);
        });
    }

    public function down(): void
    {
        foreach (['consents', 'form_submissions', 'lead_forms', 'activities', 'deals', 'lost_reasons', 'pipeline_stages', 'pipelines', 'business_unit_contact', 'contacts', 'companies'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
