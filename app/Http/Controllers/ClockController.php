<?php

namespace App\Http\Controllers;

use App\Models\AttendanceDay;
use App\Models\StoredFile;
use App\Services\AttendanceService;
use Illuminate\Http\Request;

/** Mobile clock-in/out: GPS (~100 m geofence at Kano House), selfie, registered device. */
class ClockController extends Controller
{
    public function show(Request $r)
    {
        $u = $r->user();
        abort_unless($u->canDo('attendance', 'create'), 403);
        $day = AttendanceDay::where('user_id', $u->id)->where('date', AttendanceService::today())->with('punches')->first();
        $next = $day && $day->punches->sortBy('server_time')->last()?->type === 'in' ? 'out' : 'in';

        return view('clock', compact('u', 'day', 'next'));
    }

    public function punch(Request $r, AttendanceService $svc)
    {
        $u = $r->user();
        abort_unless($u->canDo('attendance', 'create'), 403);
        $data = $r->validate([
            'type' => 'required|in:in,out', 'lat' => 'nullable|numeric|between:-90,90', 'lng' => 'nullable|numeric|between:-180,180', 'accuracy' => 'nullable|numeric|min:0',
            'device' => 'nullable|string|max:200', 'device_ts' => 'nullable|integer', 'selfie' => 'required|image|mimes:jpeg,png,webp|max:4096',
        ]);
        $f = $r->file('selfie');
        $sha = hash_file('sha256', $f->getRealPath());
        $path = $f->store('selfies/'.now()->format('Y/m'), 'private');
        $file = StoredFile::create(['disk' => 'private', 'path' => $path, 'original_name' => 'selfie.'.$f->extension(), 'mime' => $f->getMimeType(), 'size' => $f->getSize(), 'sha256' => $sha, 'purpose' => 'selfie', 'uploaded_by_id' => $u->id]);
        $p = $svc->punch($u, $data['type'], $data['lat'] ?? null, $data['lng'] ?? null, $data['accuracy'] ?? null, $data['device'] ?? null, $file->id, $sha, isset($data['device_ts']) ? intdiv((int) $data['device_ts'], 1000) : null, $r->ip());
        $msg = $p->within_geofence ? 'Clocked '.$data['type'].' at '.now('Africa/Lagos')->format('H:i').'.' : 'Recorded, but you are '.round((float) $p->distance_m).' m from the office. This punch will not count unless a manager approves it.';

        return redirect()->route('clock')->with($p->within_geofence ? 'status' : 'warning', $msg);
    }
}
