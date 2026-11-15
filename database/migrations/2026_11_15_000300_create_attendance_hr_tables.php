<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Attendance, leave, HR records (encrypted pay), lateness policy, deductions, payroll, contracts, exits.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('offices', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('name');
            $t->string('address')->nullable();
            $t->decimal('latitude', 9, 6);
            $t->decimal('longitude', 9, 6);
            $t->unsignedSmallInteger('radius_m')->default(100);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        Schema::create('staff_profiles', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('user_id')->unique()->constrained()->cascadeOnDelete();
            $t->string('employee_no', 12)->unique();
            $t->string('job_title');
            $t->string('employment_type', 12)->default('full_time');
            $t->date('start_date');
            $t->date('probation_ends')->nullable();
            $t->string('personal_email')->nullable();
            $t->string('address')->nullable();
            $t->json('next_of_kin')->nullable();
            // encrypted (PRD §11): salary, allowances, bank and ID details
            $t->text('salary')->nullable();
            $t->text('allowances')->nullable();
            $t->text('bank_name')->nullable();
            $t->text('bank_account')->nullable();
            $t->text('account_name')->nullable();
            $t->text('id_number')->nullable();
            $t->foreignUlid('office_id')->nullable()->constrained()->nullOnDelete();
            $t->string('resume_time', 5)->default('09:00');
            $t->string('close_time', 5)->default('17:00');
            $t->json('working_days'); // ISO weekdays
            $t->unsignedSmallInteger('grace_minutes')->default(0);
            $t->boolean('remote_allowed')->default(false);
            $t->ulid('lateness_policy_id')->nullable();
            $t->timestamp('onboarded_at')->nullable();
            $t->timestamps();
        });

        Schema::create('devices', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->char('fingerprint', 64);
            $t->string('label')->nullable();
            $t->string('status', 10)->default('pending'); // pending approved blocked
            $t->timestamps();
            $t->unique(['user_id', 'fingerprint']);
        });

        Schema::create('attendance_days', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->date('date');
            $t->string('status', 10)->default('pending'); // present late absent on_leave holiday weekend pending
            $t->timestamp('first_in_at')->nullable();
            $t->timestamp('last_out_at')->nullable();
            $t->unsignedSmallInteger('minutes_late')->default(0);
            $t->unsignedSmallInteger('minutes_early')->default(0);
            $t->boolean('missing_clock_out')->default(false);
            $t->unsignedSmallInteger('worked_minutes')->default(0);
            $t->boolean('is_flagged')->default(false);
            $t->timestamp('payroll_locked_at')->nullable();
            $t->timestamps();
            $t->unique(['user_id', 'date']);
            $t->index(['date', 'status']);
        });

        Schema::create('attendance_punches', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('attendance_day_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->string('type', 3); // in out
            $t->timestamp('device_time');
            $t->timestamp('server_time')->useCurrent();
            $t->decimal('latitude', 9, 6)->nullable();
            $t->decimal('longitude', 9, 6)->nullable();
            $t->unsignedSmallInteger('accuracy_m')->nullable();
            $t->decimal('distance_m', 10, 1)->nullable();
            $t->boolean('within_geofence')->default(false);
            $t->foreignUlid('office_id')->nullable()->constrained()->nullOnDelete();
            $t->ulid('selfie_file_id')->nullable();
            $t->foreignUlid('device_id')->nullable()->constrained()->nullOnDelete();
            $t->json('flags')->nullable();
            $t->string('review_status', 12)->default('not_required'); // not_required pending approved rejected
            $t->foreignUlid('reviewed_by_id')->nullable()->constrained('users')->nullOnDelete();
            $t->string('review_note')->nullable();
            $t->string('ip', 45)->nullable();
            $t->timestamps();
        });

        Schema::create('leave_requests', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->string('type', 12); // annual sick casual maternity paternity unpaid
            $t->date('start_date');
            $t->date('end_date');
            $t->decimal('days', 5, 1);
            $t->text('reason')->nullable();
            $t->string('status', 10)->default('pending');
            $t->foreignUlid('approver_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('decided_at')->nullable();
            $t->timestamps();
        });

        Schema::create('attendance_excuses', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('attendance_day_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->text('reason');
            $t->ulid('file_id')->nullable();
            $t->string('status', 10)->default('pending');
            $t->foreignUlid('reviewer_id')->nullable()->constrained('users')->nullOnDelete();
            $t->timestamp('decided_at')->nullable();
            $t->timestamps();
        });

        Schema::create('lateness_policies', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('name');
            $t->foreignUlid('unit_id')->nullable()->constrained('business_units');
            $t->string('lateness_mode', 6)->default('fixed'); // fixed tiered
            $t->decimal('fixed_amount', 18, 2)->nullable();
            $t->json('tiers')->nullable();
            $t->decimal('early_leave_amount', 18, 2)->nullable();
            $t->string('absence_mode', 10)->default('fixed'); // fixed daily_rate
            $t->decimal('absence_amount', 18, 2)->nullable();
            $t->decimal('monthly_cap_amount', 18, 2)->nullable();
            $t->decimal('monthly_cap_pct', 5, 2)->nullable();
            $t->date('effective_from');
            $t->string('document_version', 40)->nullable();
            $t->timestamps();
        });

        Schema::create('payroll_runs', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('period_month', 7)->unique();
            $t->string('status', 12)->default('draft'); // draft in_review approved signed_off paid cancelled
            $t->text('total_gross')->nullable(); // encrypted
            $t->text('total_net')->nullable(); // encrypted
            $t->unsignedSmallInteger('staff_count')->default(0);
            $t->foreignUlid('prepared_by_id')->constrained('users');
            $t->foreignUlid('approved_by_id')->nullable()->constrained('users');
            $t->timestamp('approved_at')->nullable();
            $t->foreignUlid('signed_off_by_id')->nullable()->constrained('users');
            $t->timestamp('signed_off_at')->nullable();
            $t->timestamp('paid_at')->nullable();
            $t->timestamps();
        });
        Schema::create('payslips', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('payroll_run_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('user_id')->constrained();
            $t->longText('breakdown'); // encrypted JSON
            $t->text('net_pay'); // encrypted
            $t->timestamp('emailed_at')->nullable();
            $t->timestamps();
            $t->unique(['payroll_run_id', 'user_id']);
        });

        Schema::create('deductions', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('attendance_day_id')->nullable()->constrained()->nullOnDelete();
            $t->foreignUlid('payslip_id')->nullable()->constrained()->nullOnDelete();
            $t->string('type', 18); // lateness early_departure absence advance_repayment other
            $t->decimal('amount', 18, 2);
            $t->string('reason');
            $t->string('status', 8)->default('active'); // active waived capped
            $t->string('period_month', 7)->index();
            $t->timestamps();
        });

        Schema::create('contract_templates', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->string('kind', 24);
            $t->unsignedSmallInteger('version');
            $t->string('title');
            $t->longText('body');
            $t->string('status', 8)->default('draft'); // draft approved retired
            $t->boolean('in_pack')->default(true);
            $t->string('lawyer_name')->nullable();
            $t->timestamp('lawyer_reviewed_at')->nullable();
            $t->timestamps();
            $t->unique(['kind', 'version']);
        });
        Schema::create('contract_packs', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->string('purpose', 10)->default('onboarding'); // onboarding addendum exit
            $t->string('status', 12)->default('sent'); // sent staff_signed completed void
            $t->timestamp('sent_at')->nullable();
            $t->unsignedTinyInteger('reminder_count')->default(0);
            $t->timestamp('last_reminder_at')->nullable();
            $t->timestamp('completed_at')->nullable();
            $t->timestamps();
        });

        Schema::create('exit_cases', function (Blueprint $t) {
            $t->ulid('id')->primary();
            $t->foreignUlid('user_id')->constrained();
            $t->string('type', 16); // resignation termination end_of_contract
            $t->date('notice_date');
            $t->date('last_working_day');
            $t->text('reason')->nullable();
            $t->json('checklist');
            $t->text('final_pay')->nullable(); // encrypted JSON
            $t->timestamp('access_revoked_at')->nullable();
            $t->string('status', 8)->default('open'); // open settled closed
            $t->foreignUlid('handled_by_id')->constrained('users');
            $t->timestamps();
        });

        Schema::create('training_courses', function (Blueprint $t) { // staff training centre
            $t->ulid('id')->primary();
            $t->string('title');
            $t->text('summary')->nullable();
            $t->longText('body'); // markdown lesson
            $t->json('quiz')->nullable(); // [{q, options[], answer}]
            $t->unsignedTinyInteger('pass_mark')->default(70);
            $t->boolean('required_for_new_staff')->default(false);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });
        Schema::create('training_completions', function (Blueprint $t) {
            $t->id();
            $t->foreignUlid('training_course_id')->constrained()->cascadeOnDelete();
            $t->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $t->unsignedTinyInteger('score');
            $t->boolean('passed');
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['training_completions', 'training_courses', 'exit_cases', 'contract_packs', 'contract_templates', 'deductions', 'payslips', 'payroll_runs', 'lateness_policies', 'attendance_excuses', 'leave_requests', 'attendance_punches', 'attendance_days', 'devices', 'staff_profiles', 'offices'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
