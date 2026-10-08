#!/usr/bin/env node
import {cli} from '../vendor/workbench/client.mjs';
cli().catch(e=>{console.error(e.message);process.exitCode=1;});
