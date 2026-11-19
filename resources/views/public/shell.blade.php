<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{ $title ?? 'Figuraid' }}</title>
<meta name="robots" content="noindex"><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#021e52"><link rel="icon" href="/brand/icon-32.png" type="image/png"><link rel="apple-touch-icon" href="/brand/icon-180.png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..700&display=swap">
<style>
:root{--ink:#1d1d1f;--ink2:#6e6e73;--line:#e5e5ea;--bg:#f5f5f7;--card:#fff;--accent:#075bbc;--ok:#1e7f4f;--warn:#a15c00}
@media (prefers-color-scheme:dark){:root{--ink:#f5f5f7;--ink2:#a1a1a6;--line:#2c2c2e;--bg:#000;--card:#1c1c1e;--accent:#4d9bff}}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5}
main{max-width:640px;margin:0 auto;padding:32px 16px 64px}.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px;display:grid;gap:14px}
h1{font-size:28px;letter-spacing:-.02em;margin:0}p{margin:0}.muted{color:var(--ink2)}label{font-weight:560;font-size:14px}
input,select,textarea{width:100%;font:inherit;font-size:16px;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink)}
.btn{display:inline-flex;justify-content:center;align-items:center;gap:8px;padding:14px 20px;border-radius:999px;border:0;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;min-height:48px}
.btn.big{width:100%;font-size:19px;min-height:64px}.flash{padding:12px 14px;border-radius:12px;background:#e8f5ee;color:var(--ok)}.flash.warn{background:#fff4e5;color:var(--warn)}
table{width:100%;border-collapse:collapse;font-size:15px}td,th{padding:8px 6px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--ink2);font-weight:560}.r{text-align:right}
.brand{font-weight:650;letter-spacing:-.01em;margin-bottom:20px;display:block;color:inherit;text-decoration:none}
</style>@stack('head')</head><body><main><a class="brand" href="/" aria-label="Figuraid home"><picture><source media="(prefers-color-scheme: dark)" srcset="/brand/logo-horizontal-dark.svg"><img src="/brand/logo-horizontal.svg" alt="Figuraid" height="36" style="height:36px;width:auto"></picture></a>
@if(session('status'))<p class="flash" role="status">{{ session('status') }}</p><br>@endif
@if(session('warning'))<p class="flash warn" role="alert">{{ session('warning') }}</p><br>@endif
@yield('body')</main>@stack('scripts')</body></html>
