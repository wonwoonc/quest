import {bootstrap} from './bootstrap.js';
import {createDemoFixture} from './fixtures/demo.js';
bootstrap({mode:'demo', seed:createDemoFixture()});
