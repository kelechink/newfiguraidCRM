<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\Audited;

class LostReason extends Model
{
    use Audited;

    public $timestamps = false;

    protected $guarded = ['id'];

}
