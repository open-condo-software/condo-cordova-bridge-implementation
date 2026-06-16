const publish = require('mono-pub')
const git = require('@mono-pub/git')
const github = require('@mono-pub/github')
const npm = require('@mono-pub/npm')
const commitAnalyzer = require('@mono-pub/commit-analyzer')
const execa = require('execa')

const BREAKING_KEYWORDS = ['BREAKING CHANGE', 'BREAKING-CHANGE', 'BREAKING CHANGES', 'BREAKING-CHANGES']

/** @type {import('mono-pub').MonoPubPlugin} */
const builder = {
	name: '@mono-pub/local-builder',
	async prepareSingle({ targetPackage }) {
		await execa('npm', ['run', 'build'], { cwd: targetPackage.location })
	},
}

/** @type {import('mono-pub').MonoPubPlugin} */
const assetPublisher = {
	name: '@mono-pub/asset-publisher',
	async publish({ location }) {
		await execa('node', ['bin/upload.js '], { cwd: location, env: process.env })
	},
}

publish(
	['package.json'],
	[
		git(),
		github({
			extractCommitsFromSquashed: false,
			releaseNotesOptions: {
				rules: [
					{ breaking: true, section: '⚠️ BREAKING CHANGES' },
					{ type: 'feat', section: '🦕 New features' },
					{ type: 'fix', section: '🐞 Bug fixes' },
					{ type: 'perf', section: '🚀 Performance increases' },
					{ dependency: true, section: '🌐Dependencies' },
				],
				breakingNoteKeywords: BREAKING_KEYWORDS,
			},
		}),
		commitAnalyzer({
			minorTypes: ['feat'],
			patchTypes: ['perf', 'fix'],
			breakingNoteKeywords: BREAKING_KEYWORDS,
		}),
		builder,
		assetPublisher,
		npm({ provenance: true, trustedPublishing: false }),
	],
)
