import type {
	AnyRequestMethodName,
	RequestParams,
	ResultResponseDataMap,
	ErrorReason,
	ErrorCode,
	ErrorResponseData,
	CloseApplicationParams,
	CloseApplicationData,
	GetAvailableMethodsParams,
	GetAvailableMethodsData,
	GetFragmentParams,
	GetFragmentData,
	GetLaunchParamsParams,
	GetLaunchParamsData,
} from '@open-condo/bridge'
import { z } from 'zod/mini'

type SuccessCallback = (result: unknown) => void
type ErrorCallback = (error: unknown) => void

declare global {
	interface Window {
		cordova?: {
			plugins?: {
				condo?: {
					closeApplication?: (success: SuccessCallback, error: ErrorCallback) => void
					getCurrentResident?: (success: SuccessCallback, error: ErrorCallback) => void
					getLaunchContext?: (success: SuccessCallback, error: ErrorCallback) => void

					hostApplication?: {
						deviceID: () => string
						locale: () => string
					}
				}
			}
		}
	}
}

const RESIDENT_SCHEMA = z.object({
	id: z.uuid(),
	user: z.object({
		id: z.uuid(),
		type: z.enum(['staff', 'resident']),
	}),
})
const DEFAULT_LOCALE = 'ru_RU'

export class BridgeCordovaAdapter {
	readonly #registeredHandlers: Partial<{
		[T in AnyRequestMethodName]: (params: RequestParams<T>) => Promise<ResultResponseDataMap[T]>
	}> = {}
	readonly #sessionId: string

	constructor() {
		this.#registeredHandlers = {
			CondoWebAppCloseApplication: this.#closeApplication.bind(this),
			CondoWebAppGetAvailableMethods: this.#getAvailableMethods.bind(this),
			CondoWebAppGetFragment: this.#getFragment.bind(this),
			CondoWebAppGetLaunchParams: this.#getLaunchParams.bind(this),
		}
		// NOTE: fallback for deviceId
		this.#sessionId = crypto.randomUUID()
	}

	async #closeApplication(_params: CloseApplicationParams): Promise<CloseApplicationData> {
		const cordovaHandler = window?.cordova?.plugins?.condo?.closeApplication
		if (typeof cordovaHandler === 'function') {
			return new Promise((resolve, reject) => {
				cordovaHandler(resolve, reject)
			})
				.then(() => ({ success: true }))
				.catch(() => ({ success: false }))
		}

		return { success: false }
	}

	async #getAvailableMethods(_params: GetAvailableMethodsParams): Promise<GetAvailableMethodsData> {
		return {
			methods: Object.keys(this.#registeredHandlers) as Array<AnyRequestMethodName>,
		}
	}

	async #getFragment(_params: GetFragmentParams): Promise<GetFragmentData> {
		const cordovaHandler = window?.cordova?.plugins?.condo?.getLaunchContext
		if (typeof cordovaHandler === 'function') {
			const context = await new Promise((resolve, reject) => {
				cordovaHandler(resolve, reject)
			}).catch(() => '')

			if (typeof context === 'string') {
				return { fragment: context }
			}
		}

		return { fragment: '' }
	}

	async #getLaunchParams(_params: GetLaunchParamsParams): Promise<GetLaunchParamsData> {
		const cordovaHandler = window.cordova?.plugins?.condo?.getCurrentResident
		const deviceId = window.cordova?.plugins?.condo?.hostApplication?.deviceID()
		const sessionId = this.#sessionId
		const locale = window.cordova?.plugins?.condo?.hostApplication?.locale()

		if (typeof cordovaHandler === 'function') {
			const resident = await new Promise((resolve, reject) => {
				cordovaHandler(resolve, reject)
			})
			const { success, data } = RESIDENT_SCHEMA.safeParse(resident)
			if (success && data) {
				return {
					condoUserType: data.user.type,
					condoUserId: data.user.id,
					condoContextEntity: 'Resident',
					condoContextEntityId: data.id,
					condoLocale: typeof locale === 'string' ? locale : DEFAULT_LOCALE,
					condoDeviceId: typeof deviceId === 'string' ? deviceId : sessionId,
				}
			}
		}

		throw new Error('Cordova method error (getCurrentResident)')
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
