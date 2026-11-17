<!doctype html><html><head><meta charset="utf-8"><style>
@page{margin:0}body{margin:0;font-family:DejaVu Sans,sans-serif;color:#1d1d1f}
.frame{position:absolute;top:28px;left:28px;right:28px;bottom:28px;border:3px solid #075bbc;padding:56px 70px;text-align:center}
.brand{font-size:16px;letter-spacing:4px;text-transform:uppercase;color:#075bbc}h1{font-size:36px;margin:14px 0 6px;color:#021e52}
.name{font-size:34px;font-weight:bold;margin:18px 0}.muted{color:#6e6e73}.qr{position:absolute;right:70px;bottom:56px;text-align:center;font-size:10px}
.sig{position:absolute;left:70px;bottom:70px;text-align:left;font-size:12px}
</style></head><body>@php($logo = 'data:image/png;base64,'.base64_encode(file_get_contents(public_path('brand/logo-full-600.png'))))<div class="frame">
<img src="{{ $logo }}" style="height:64px"><div class="brand" style="margin-top:6px">Figure Academy</div>
<h1>Certificate of Completion</h1>
<p class="muted">This certifies that</p>
<div class="name">{{ $e->contact->display_name }}</div>
<p class="muted">has successfully completed</p>
<p style="font-size:22px;font-weight:bold">{{ $e->cohort->course->title }}</p>
<p class="muted">{{ $e->cohort->name }} · issued {{ $e->certificate_issued_at->format('j F Y') }}</p>
<div class="sig">______________________<br>Academy Coordinator<br>Figuraid Ltd, Abuja</div>
<div class="qr"><img src="{{ $qr }}" width="110" height="110"><br>Verify: {{ $e->certificate_code }}</div>
</div></body></html>
