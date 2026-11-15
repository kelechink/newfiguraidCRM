<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// v3: carrier billing cycles, vendor statements, prepaid burn; data-rights requests & export log; employer payroll
// costs; WhatsApp templates; official + parallel FX on money records; certificates; portal invites.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('carriers', function (Blueprint $t) {
            $t->string('billing_mode', 8)->default('prepaid')->after('billing_cycle'); // prepaid postpaid
            $t->date('cycle_anchor')->nullable()->after('billing_mode');
            $t->decimal('low_balance_threshold', 18, 2)->default(0)->after('prepaid_balance');
            $t->timestamp('suspended_at')->nullable();
            $t->string('suspend_reason')->nullable();
        });
        Schema::create('billing_cycles', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('carrier_id')->constrained()->cascadeOnDelete();
            $t->string('side', 8); // customer (we bill) | vendor (they bill us)
            $t->date('period_start');
            $t->date('period_end'); // exclusive
            $t->date('due_date');
            $t->decimal('minutes', 16, 4)->default(0);
            $t->decimal('amount', 18, 4)->default(0);
            $t->string('currency', 3);
            $t->foreignUlid('invoice_id')->nullable()->constrained()->nullOnDelete();
            $t->decimal('statement_minutes', 16, 4)->nullable(); // vendor's own figures
            $t->decimal('statement_amount', 18, 4)->nullable();
            $t->foreignUlid('statement_file_id')->nullable()->constrained('stored_files')->nullOnDelete();
            $t->string('status', 12)->default('open'); // open invoiced matched mismatch disputed settled
            $t->timestamps();
            $t->unique(['carrier_id', 'side', 'period_start']);
        });
        Schema::create('prepaid_ledger', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('carrier_id')->constrained()->cascadeOnDelete();
            $t->date('date');
            $t->string('kind', 10); // topup usage adjustment
            $t->decimal('amount', 18, 4); // + topup, − usage
            $t->decimal('balance_after', 18, 4);
            $t->string('reference')->nullable();
            $t->foreignUlid('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamps();
            $t->unique(['carrier_id', 'kind', 'date', 'reference']);
        });

        Schema::create('data_requests', function (Blueprint $t) { // NDPA data-subject requests
            $t->ulid('id')->primary();
            $t->string('kind', 10); // access correct delete object withdraw
            $t->string('name');
            $t->string('email');
            $t->text('details')->nullable();
            $t->foreignUlid('contact_id')->nullable()->constrained()->nullOnDelete();
            $t->string('status', 12)->default('received'); // received verified completed rejected
            $t->string('verify_token', 64)->nullable();
            $t->timestamp('verified_at')->nullable();
            $t->date('due_on'); // 30 days
            $t->foreignUlid('handled_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->text('outcome')->nullable();
            $t->string('ip', 45)->nullable();
            $t->timestamps();
        });
        Schema::create('export_logs', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->string('what', 80);
            $t->unsignedInteger('rows');
            $t->string('ip', 45)->nullable();
            $t->timestamp('created_at')->useCurrent();
        });

        Schema::table('payroll_runs', function (Blueprint $t) {
            $t->text('employer_costs')->nullable(); // encrypted JSON: pension 10%, NSITF 1%, ITF 1%
        });
        Schema::create('whatsapp_templates', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('name', 80); // as approved in Meta
            $t->string('language', 10)->default('en');
            $t->text('body'); // with {{1}}, {{2}} placeholders, for preview
            $t->unsignedTinyInteger('params')->default(0);
            $t->string('unit_code', 12)->nullable();
            $t->boolean('is_active')->default(true);
            $t->timestamps();
            $t->unique(['name', 'language']);
        });
        foreach (['invoices', 'expenses', 'payments'] as $tbl) {
            Schema::table($tbl, fn (Blueprint $t) => $t->decimal('fx_rate_official', 14, 4)->nullable());
        }
        Schema::table('portal_users', function (Blueprint $t) {
            $t->string('invite_token', 64)->nullable()->unique();
            $t->timestamp('invited_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('portal_users', fn (Blueprint $t) => $t->dropColumn(['invite_token', 'invited_at']));
        foreach (['invoices', 'expenses', 'payments'] as $tbl) {
            Schema::table($tbl, fn (Blueprint $t) => $t->dropColumn('fx_rate_official'));
        }
        Schema::dropIfExists('whatsapp_templates');
        Schema::table('payroll_runs', fn (Blueprint $t) => $t->dropColumn('employer_costs'));
        Schema::dropIfExists('export_logs');
        Schema::dropIfExists('data_requests');
        Schema::dropIfExists('prepaid_ledger');
        Schema::dropIfExists('billing_cycles');
        Schema::table('carriers', fn (Blueprint $t) => $t->dropColumn(['billing_mode', 'cycle_anchor', 'low_balance_threshold', 'suspended_at', 'suspend_reason']));
    }
};
