import { environment } from '../_shared/common.js';
import { clientQrHandler } from './handler.js';
Deno.serve((request) => clientQrHandler(request, environment()));
