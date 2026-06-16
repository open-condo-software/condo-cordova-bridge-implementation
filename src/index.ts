import { PostMessageController } from '@open-condo/miniapp-utils/helpers/messaging'
import { registerCordovaEvents, subscribeToCordovaEvents } from './events/cordova'

declare global {
	interface Window {
		__condoBridgeCleanup?: () => void
	}
}

function main() {
	if (typeof window === 'undefined') return

	if (typeof window.__condoBridgeCleanup === 'function') {
		window.__condoBridgeCleanup()
	}

	const controller = new PostMessageController()
	controller.registerBridgeEvents({})
	registerCordovaEvents(controller)
	const unsubscribe = subscribeToCordovaEvents()

	window.addEventListener('message', controller.eventListener)

	function cleanup() {
		unsubscribe()
		window.removeEventListener('message', controller.eventListener)
		delete window.__condoBridgeCleanup
	}

	window.__condoBridgeCleanup = cleanup
	window.addEventListener('beforeunload', cleanup, { once: true })
}

main()
