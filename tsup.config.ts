import { defineConfig } from 'tsup'

export default defineConfig({
	entry: { 'browser.min': 'src/index.ts' },
	format: ['iife'],
	outDir: 'dist',
	clean: true,
	minify: true,
	sourcemap: false,
	target: 'es2020',
	globalName: 'CordovaWeb',
	platform: 'browser',
	noExternal: [/.*/], // Bundle everything
	outExtension: () => ({ js: '.js' }),
})
