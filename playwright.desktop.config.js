import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/desktop',timeout:180000,workers:1,reporter:'list',use:{acceptDownloads:true},outputDir:'output/desktop-tests'});
