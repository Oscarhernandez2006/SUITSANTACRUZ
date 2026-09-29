<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

abstract class Controller
{
    /** Exige al menos uno de los permisos de la Suite (ver App\Support\SuitePermissions). */
    protected function authorizeSuite(Request $request, string ...$permissions): void
    {
        abort_unless((bool) $request->user()?->canSuite(...$permissions), Response::HTTP_FORBIDDEN, 'No tienes permiso para esta acción');
    }
}
