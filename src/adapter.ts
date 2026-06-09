import type {
	AnyRequestMethodName,
	RequestParams,
	ResultResponseDataMap,
	ErrorReason,
	ErrorCode,
	ErrorResponseData,
	GetAvailableMethodsParams,
	GetAvailableMethodsData,
} from '@open-condo/bridge'

export class BridgeCordovaAdapter {
	readonly #registeredHandlers: Partial<{
		[T in AnyRequestMethodName]: (params: RequestParams<T>) => Promise<ResultResponseDataMap[T]>
	}> = {}

	constructor() {
		this.#registeredHandlers = {
			CondoWebAppGetAvailableMethods: this.#getAvailableMethods.bind(this),
		}
	}

	async #getAvailableMethods(_params: GetAvailableMethodsParams): Promise<GetAvailableMethodsData> {
		return {
			methods: Object.keys(this.#registeredHandlers) as Array<AnyRequestMethodName>,
		}
	}

	#getError<Reason extends ErrorReason>(reason: Reason, code: ErrorCode<Reason>, message: string): ErrorResponseData {
		return {
			errorType: 'client',
			errorCode: code,
			errorReason: reason,
			errorMessage: message,
		}
	}

	async execute<Method extends AnyRequestMethodName>(
		method: Method,
		params: RequestParams<Method>,
	): Promise<ResultResponseDataMap[Method]> {
		const handler = this.#registeredHandlers[method]
		if (!handler) {
			throw this.#getError('UNKNOWN_METHOD', 2, 'Not supported')
		}

		try {
			return await handler(params)
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error)
			throw this.#getError('HANDLER_ERROR', 4, msg)
		}
	}
}
