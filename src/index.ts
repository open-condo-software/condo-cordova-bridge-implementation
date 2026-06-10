import { BridgeCordovaAdapter } from './adapter'

declare global {
	interface Window {
		condoBridgeAdapter: BridgeCordovaAdapter
	}
}

window.condoBridgeAdapter = new BridgeCordovaAdapter()
