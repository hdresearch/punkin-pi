#!/usr/bin/env node
/**
 * Punkin GUI — Entry point.
 * 
 * Launches the native macOS GUI for punkin-pi.
 * 
 * Usage:
 *   punkin-gui              # Launch GUI
 *   punkin-gui --debug      # Launch with debug logging
 */

import { createRuntime } from './core/runtime.js';
import { punkinApp } from './app/index.js';
import { createAppKitBackend } from './backends/appkit/index.js';

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const debug = args.includes('--debug') || args.includes('-d');
	
	console.log('Punkin GUI starting...');
	
	// Check platform
	if (process.platform !== 'darwin') {
		console.error('Error: Punkin GUI currently only supports macOS.');
		console.error('Other platforms coming soon (Qt backend).');
		process.exit(1);
	}
	
	try {
		// Create the AppKit backend
		const backend = createAppKitBackend();
		
		// Create runtime
		const runtime = createRuntime({
			app: punkinApp,
			backend,
			window: {
				title: 'Punkin',
				width: 1200,
				height: 800,
				minWidth: 600,
				minHeight: 400,
				resizable: true,
			},
			debug,
		});
		
		console.log('Starting runtime...');
		
		// Handle process signals
		process.on('SIGINT', () => {
			console.log('\nShutting down...');
			runtime.stop();
			process.exit(0);
		});
		
		process.on('SIGTERM', () => {
			runtime.stop();
			process.exit(0);
		});
		
		// Run the app (blocks until window closes)
		await runtime.start();
		
		console.log('Punkin GUI closed.');
		process.exit(0);
	} catch (error) {
		console.error('Fatal error:', error);
		process.exit(1);
	}
}

main();
