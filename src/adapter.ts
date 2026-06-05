import type { AnyRequestMethodName, RequestParams, ResultResponseDataMap } from '@open-condo/bridge'

export class BridgeCordovaAdapter {
	#supportedMethods: Array<AnyRequestMethodName> = []

	async execute<Method extends AnyRequestMethodName>(
		method: Method,
		_params: RequestParams<Method>,
	): Promise<ResultResponseDataMap[Method]> {
		if (!this.#supportedMethods.includes(method)) {
			// t
		}

		throw new Error('Not implemented')
	}
}
