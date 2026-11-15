<?php

namespace Tests\Feature;

use App\Filament\Pages\WhiteboardPage;
use App\Models\AttendanceDay;
use App\Models\AttendanceExcuse;
use App\Models\ChatMessage;
use App\Models\Setting;
use App\Models\Task;
use App\Models\User;
use App\Models\WhiteboardPost;
use App\Services\AiGateway;
use App\Services\StaffAgents\HrAgent;
use App\Services\Whiteboard;
use Carbon\CarbonImmutable;
use Database\Seeders\CoreSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Livewire\Livewire;
use Tests\TestCase;

class WhiteboardTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    private AttendanceDay $day;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([CoreSeeder::class, DemoSeeder::class]);
        Mail::fake();
        Setting::put('whiteboard.first_offence_private', false); // most tests check the public board directly
        $this->staff = User::where('email', 'staff@figuraid.test')->first();
        $date = CarbonImmutable::now('Africa/Lagos')->subDay()->toDateString();
        $this->day = AttendanceDay::updateOrCreate(['user_id' => $this->staff->id, 'date' => $date], ['status' => 'late', 'minutes_late' => 14, 'first_in_at' => now()->subDay(), 'minutes_early' => 0]);
    }

    public function test_hr_tags_late_staff_on_whiteboard_and_general_once(): void
    {
        app(HrAgent::class)->callouts($this->day->date->toDateString());
        app(HrAgent::class)->callouts($this->day->date->toDateString());
        $posts = WhiteboardPost::where('subject_user_id', $this->staff->id)->where('hashtags', 'like', '%"late"%')->get();
        $this->assertCount(1, $posts);
        $this->assertStringContainsString('14 min late', $posts[0]->body);
        $this->assertTrue(ChatMessage::where('agent_key', 'hr')->where('body', 'like', '#late @'.$this->staff->name.'%')->exists());
        $this->assertTrue(WhiteboardPost::where('subject_user_id', $this->staff->id)->where('hashtags', 'like', '%"noreport"%')->exists());
        Mail::assertNothingSent(); // agents never email
    }

    public function test_approved_excuse_takes_the_callout_down(): void
    {
        app(HrAgent::class)->callouts($this->day->date->toDateString());
        AttendanceExcuse::forceCreate(['attendance_day_id' => $this->day->id, 'user_id' => $this->staff->id, 'reason' => 'Client visit', 'status' => 'approved']);
        app(Whiteboard::class)->reconcileDay($this->day);
        $p = WhiteboardPost::where('subject_user_id', $this->staff->id)->where('hashtags', 'like', '%"late"%')->first();
        $this->assertNotNull($p->retracted_at);
        $this->assertSame('Excuse approved', $p->retract_reason);
        $this->assertFalse(WhiteboardPost::live()->whereKey($p->id)->exists());
    }

    public function test_waived_deduction_takes_the_callout_down(): void
    {
        app(HrAgent::class)->callouts($this->day->date->toDateString());
        app(Whiteboard::class)->retractForDeduction($this->day->id, 'lateness', null);
        $this->assertNotNull(WhiteboardPost::where('hashtags', 'like', '%"late"%')->where('subject_user_id', $this->staff->id)->value('retracted_at'));
    }

    public function test_callouts_can_be_switched_off_but_kudos_still_post(): void
    {
        Setting::put('whiteboard.callouts_enabled', false);
        $this->assertSame(0, app(HrAgent::class)->callouts($this->day->date->toDateString()));
        $this->assertNotNull(app(Whiteboard::class)->post('hr', $this->staff, ['perfectweek'], 'was on time all week.'));
    }

    public function test_staff_can_dispute_and_only_post_kudos(): void
    {
        $this->app->instance(AiGateway::class, new class extends AiGateway
        {
            public function complete(string $s, string $p, string $t = 'light', bool $search = false, bool $mask = true): array
            {
                return ['text' => 'ok', 'provider' => 'x', 'model' => 'x'];
            }
        });
        app(HrAgent::class)->callouts($this->day->date->toDateString());
        $post = WhiteboardPost::where('subject_user_id', $this->staff->id)->first();
        $this->actingAs($this->staff);
        $this->get('/app/whiteboard')->assertOk()->assertSee('#late');
        Livewire::test(WhiteboardPage::class)->set('disputeText', 'Traffic accident on the expressway')->call('dispute', $post->id);
        $this->assertTrue(Task::where('title', 'like', 'Whiteboard dispute:%')->exists());
        $other = User::where('email', 'support@figuraid.test')->first();
        Livewire::test(WhiteboardPage::class)->set('newUser', $other->id)->set('newTags', ['late'])->set('newNote', 'was late')->call('postNew')->assertForbidden();
        Livewire::test(WhiteboardPage::class)->set('newUser', $other->id)->set('newTags', ['shoutout'])->set('newNote', 'helped me close a ticket')->call('postNew');
        $this->assertTrue(WhiteboardPost::where('subject_user_id', $other->id)->where('kind', 'kudos')->exists());
        Livewire::test(WhiteboardPage::class)->call('retract', $post->id)->assertForbidden();
    }

    public function test_hr_can_take_a_post_down(): void
    {
        app(HrAgent::class)->callouts($this->day->date->toDateString());
        $post = WhiteboardPost::where('subject_user_id', $this->staff->id)->first();
        $this->actingAs($this->makeUser('hr'));
        Livewire::test(WhiteboardPage::class)->set('retractReason', 'Power outage at the office')->call('retract', $post->id);
        $this->assertSame('Power outage at the office', $post->fresh()->retract_reason);
    }

    public function test_first_offence_is_private_and_repeat_goes_public(): void
    {
        Setting::put('whiteboard.first_offence_private', true);
        $wb = app(Whiteboard::class);
        $this->assertNull($wb->post('hr', $this->staff, ['late'], 'arrived 5 min late on Mon.', null, null, 'late:a'));
        $this->assertFalse(WhiteboardPost::where('subject_user_id', $this->staff->id)->exists());
        $this->assertTrue(ChatMessage::where('agent_key', 'hr')->where('body', 'like', '%Private warning: #late%')->exists());
        $this->assertNotNull($wb->post('hr', $this->staff, ['late'], 'arrived 9 min late on Tue.', null, null, 'late:b'));
        $this->assertNull($wb->post('hr', $this->staff, ['absent'], 'was absent on Wed.', null, null, 'absent:c')); // first of a different kind: private
        $this->assertNotNull($wb->post('hr', $this->staff, ['perfectweek'], 'kudos are always public.'));
    }
}
