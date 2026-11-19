import { environment } from '../_shared/common.js';
import { clientAdminHandler } from './handler.js';
Deno.serve((request) => clientAdminHandler(request, environment()));
