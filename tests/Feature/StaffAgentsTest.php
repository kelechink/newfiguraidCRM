<?php

namespace Tests\Feature;

use App\Models\AiAction;
use App\Models\AttendanceDay;
use App\Models\ChatMessage;
use App\Models\Expense;
use App\Models\Setting;
use App\Models\StaffPoint;
use App\Models\Task;
use App\Models\User;
use App\Services\AgentMessenger;
use App\Services\AiGateway;
use App\Services\StaffAgents\AccountantAgent;
use App\Services\StaffAgents\ChatResponder;
use App\Services\StaffAgents\GeneralManagerAgent;
use App\Services\StaffAgents\HrAgent;
use Carbon\CarbonImmutable;
use Database\Seeders\CoreSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class StaffAgentsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([CoreSeeder::class, DemoSeeder::class]);
        Mail::fake();
        // No AI provider is reachable in tests: any accidental call must fail loudly.
        $this->app->instance(AiGateway::class, new class extends AiGateway
        {
            public array $prompts = [];

            public function complete(string $system, string $prompt, string $tier = 'light', bool $search = false, bool $mask = true): array
            {
                $this->prompts[] = $system."\n".$prompt;

                return ['text' => 'Sure — HR will confirm. HANDOFF: yes', 'provider' => 'fake', 'model' => 'fake'];
            }
        });
    }

    public function test_hr_nudges_people_not_clocked_in_once_and_skips_people_on_leave(): void
    {
        $this->travelTo(CarbonImmutable::parse('next monday 09:25', 'Africa/Lagos'));
        $staff = User::where('email', 'staff@figuraid.test')->first();
        $sup = User::where('email', 'support@figuraid.test')->first();
        \App\Models\LeaveRequest::create(['user_id' => $sup->id, 'type' => 'annual', 'start_date' => today(), 'end_date' => today(), 'days' => 1, 'status' => 'approved']);
        app(HrAgent::class)->morning();
        $this->assertTrue(ChatMessage::where('agent_key', 'hr')->where('body', 'like', '%not clocked in%')->whereHas('chatChannel', fn ($q) => $q->where('direct_key', "agent:hr:$staff->id"))->exists());
        $this->assertFalse(ChatMessage::where('agent_key', 'hr')->whereHas('chatChannel', fn ($q) => $q->where('direct_key', "agent:hr:$sup->id"))->exists());
        $before = ChatMessage::where('agent_key', 'hr')->count();
        app(HrAgent::class)->morning();
        $this->assertSame($before, ChatMessage::where('agent_key', 'hr')->count()); // no duplicate nudges
    }

    public function test_absence_creates_tracked_request_then_reminders_then_escalation(): void
    {
        $u = User::where('email', 'staff@figuraid.test')->first();
        $day = AttendanceDay::updateOrCreate(['user_id' => $u->id, 'date' => CarbonImmutable::now('Africa/Lagos')->subDay()->toDateString()], ['status' => 'absent']);
        app(HrAgent::class)->daily();
        $t = Task::where('agent_key', 'hr')->where('assignee_id', $u->id)->where('tags', 'like', "%absence-$day->id%")->firstOrFail();
        $this->assertTrue(AiAction::where('agent_key', 'hr')->where('kind', 'message')->where('subject_id', $u->id)->exists());

        $m = app(AgentMessenger::class);
        $this->travel(3)->days();
        $m->followUps();
        $this->travel(25)->hours();
        $m->followUps();
        $this->assertSame(2, $t->fresh()->reminder_count);
        $this->travel(25)->hours();
        $m->followUps();
        $this->assertNotNull($t->fresh()->escalated_at);
        $mgr = AgentMessenger::managerOf($u);
        $this->assertTrue(ChatMessage::where('body', 'like', '%Escalation%')->whereHas('chatChannel', fn ($q) => $q->where('direct_key', "agent:hr:$mgr->id"))->exists());
    }

    public function test_daily_message_cap_per_person(): void
    {
        Setting::put('agents.max_messages_per_person_per_day', 2);
        $u = User::where('email', 'staff@figuraid.test')->first();
        $m = app(AgentMessenger::class);
        $this->assertTrue($m->tell('gm', $u, 'One', 'x'));
        $this->assertTrue($m->tell('hr', $u, 'Two', 'x'));
        $this->assertFalse($m->tell('accountant', $u, 'Three', 'x'));
    }

    public function test_paused_agent_sends_nothing(): void
    {
        \App\Models\AiAgent::where('key', 'gm')->update(['status' => 'paused']);
        $this->assertFalse(app(AgentMessenger::class)->tell('gm', User::first(), 'Hi', 'x'));
    }

    public function test_accountant_chases_receipts_and_never_calls_ai(): void
    {
        $e = Expense::where('status', 'paid')->first();
        app(AccountantAgent::class)->daily();
        app(AccountantAgent::class)->weekly();
        $this->assertTrue(Task::where('agent_key', 'accountant')->where('tags', 'like', "%receipt-$e->id%")->exists());
        $this->assertSame([], app(AiGateway::class)->prompts, 'Finance figures must never be sent to an AI model');
        $note = ChatMessage::where('agent_key', 'accountant')->where('body', 'like', '%Weekly cash note%')->first();
        $this->assertNotNull($note);
    }

    public function test_gm_chases_overdue_tasks_and_stalled_deals(): void
    {
        $this->travelTo(CarbonImmutable::parse('next tuesday 08:45', 'Africa/Lagos'));
        $n = app(GeneralManagerAgent::class)->morning();
        $this->assertGreaterThan(0, $n);
        $this->assertTrue(ChatMessage::where('agent_key', 'gm')->where('body', 'like', '%overdue task%')->exists());
        app(GeneralManagerAgent::class)->weekly();
        $this->assertTrue(ChatMessage::where('agent_key', 'gm')->where('body', 'like', '%Weekly operations review%')->exists());
    }

    public function test_staff_reply_done_closes_request_and_ai_never_sees_salary(): void
    {
        $u = User::where('email', 'staff@figuraid.test')->first();
        $t = app(AgentMessenger::class)->request('hr', $u, 'Upload your NIN slip', 'Please upload it.', now()->addDay(), 'nin');
        $c = AgentMessenger::channel(\App\Models\AiAgent::where('key', 'hr')->first(), $u);
        app(ChatResponder::class)->respond($c, $u, 'Done, uploaded it this morning');
        $this->assertSame('done', $t->fresh()->status);

        app(ChatResponder::class)->respond($c, $u, 'What is my salary and can you approve my leave?');
        $prompts = implode("\n", app(AiGateway::class)->prompts);
        $this->assertStringNotContainsString((string) $u->staffProfile->salary, $prompts);
        $this->assertStringNotContainsString((string) $u->staffProfile->bank_account, $prompts);
        $this->assertTrue(\Illuminate\Notifications\DatabaseNotification::where('data', 'like', '%needs a person%')->exists());
    }

    public function test_monthly_points_ranked_and_announced(): void
    {
        $month = now()->format('Y-m');
        app(HrAgent::class)->monthlyPoints($month);
        $rows = StaffPoint::where('period_month', $month)->orderBy('rank')->get();
        $this->assertNotEmpty($rows);
        $this->assertSame(1, $rows->first()->rank);
        $this->assertGreaterThanOrEqual($rows->last()->points, $rows->first()->points);
        $this->assertTrue(ChatMessage::where('agent_key', 'hr')->where('body', 'like', 'Staff points for%')->exists());
    }
}
