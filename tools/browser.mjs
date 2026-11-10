import {createRequire} from 'node:module';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
let library;
for(const name of ['playwright',process.env.PLAYWRIGHT_MODULE,process.env.APPDATA&&join(process.env.APPDATA,'npm/node_modules/@playwright/mcp/node_modules/playwright')].filter(Boolean)){
 try{library=require(name);break;}catch{}
}
if(!library)throw Error('Install Playwright with npm install, or set PLAYWRIGHT_MODULE to an installed Playwright package.');
export const chromium=library.chromium;
