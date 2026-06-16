import type { PostMessageController } from '@open-condo/miniapp-utils/helpers/messaging'
import { zodSchemaToValidator } from '@open-condo/miniapp-utils/helpers/messaging'
import { generateUUIDv4 } from '@open-condo/miniapp-utils/helpers/uuid'
import { z } from 'zod'
import type {
	CloseApplicationParams,
	CloseApplicationData,
	GetFragmentParams,
	GetFragmentData,
	GetLaunchParamsParams,
	GetLaunchParamsData,
	PopHistoryStateParams,
	PopHistoryStateData,
	PushHistoryStateParams,
	PushHistoryStateData,
	ReplaceHistoryStateParams,
	ReplaceHistoryStateData,
	RequestAuthParams,
	RequestAuthData,
	CondoBridgeIncomingEvent,
} from '@open-condo/bridge'

type SuccessCallback = (result: unknown) => void
type ErrorCallback = (error: unknown) => void
type CleanupFn = () => void

declare global {
	interface Window {
		cordova?: {
			plugins?: {
				condo?: {
					closeApplication?: (success: SuccessCallback, error: ErrorCallback) => void
					getCurrentResident?: (success: SuccessCallback, error: ErrorCallback) => void
					getLaunchContext?: (success: SuccessCallback, error: ErrorCallback) => void
					requestServerAuthorizationByUrl?: (
						url: string,
						_options: Record<string, never>,
						success: SuccessCallback,
						error: ErrorCallback,
					) => void

					hostApplication?: {
						deviceID: () => string
						locale: () => string
					}

					history?: {
						pushState?: (
							state: unknown | null,
							title: string | null,
							success: SuccessCallback,
							error: ErrorCallback,
						) => void
						replaceState?: (
							state: unknown | null,
							title: string | null,
							success: SuccessCallback,
							error: ErrorCallback,
						) => void
						go?: (amount: number, success: SuccessCallback, error: ErrorCallback) => void
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
const AUTH_RESPONSE_SCHEMA = z.object({
	status: z.number(),
	url: z.url(),
	body: z.string().nullish(),
})
const HISTORY_STATE_SCHEMA = z.strictObject({
	title: z.string().nullish(),
	state: z.unknown().optional(),
})
const DEFAULT_LOCALE = 'ru_RU'

const INTERNAL_HISTORY_STATE_SCHEMA = z.strictObject({
	__state: z.unknown().optional(),
	__title: z.string().nullish(),
})

type InternalHistoryState = z.infer<typeof INTERNAL_HISTORY_STATE_SCHEMA>

export function registerCordovaEvents(controller: PostMessageController) {
	const sessionId = generateUUIDv4()

	controller.addHandler<CloseApplicationParams, CloseApplicationData>(
		'condo-bridge',
		'CondoWebAppCloseApplication',
		'*',
		zodSchemaToValidator(z.strictObject({})),
		() => {
			const cordovaHandler = window?.cordova?.plugins?.condo?.closeApplication
			if (typeof cordovaHandler !== 'function') {
				return { success: false }
			}

			return new Promise((resolve, reject) => {
				cordovaHandler(resolve, reject)
			})
				.then(() => ({ success: true }))
				.catch(() => ({ success: false }))
		},
	)

	controller.addHandler<GetFragmentParams, GetFragmentData>(
		'condo-bridge',
		'CondoWebAppGetFragment',
		'*',
		zodSchemaToValidator(z.strictObject({})),
		async () => {
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
		},
	)

	controller.addHandler<GetLaunchParamsParams, GetLaunchParamsData>(
		'condo-bridge',
		'CondoWebAppGetLaunchParams',
		'*',
		zodSchemaToValidator(z.strictObject({})),
		async () => {
			const cordovaHandler = window.cordova?.plugins?.condo?.getCurrentResident
			const deviceId = window.cordova?.plugins?.condo?.hostApplication?.deviceID()
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
		},
	)

	controller.addHandler<PushHistoryStateParams, PushHistoryStateData>(
		'condo-bridge',
		'CondoWebAppPushHistoryState',
		'*',
		zodSchemaToValidator(HISTORY_STATE_SCHEMA),
		async ({ params }) => {
			const cordovaHandler = window.cordova?.plugins?.condo?.history?.pushState
			if (typeof cordovaHandler !== 'function') {
				throw new Error('Unsupported cordova method (history.pushState)')
			}

			const wrappedState: InternalHistoryState = {
				__state: params.state ?? null,
				__title: params.title ?? null,
			}

			return new Promise((resolve, reject) => {
				cordovaHandler(wrappedState, params.title ?? null, resolve, reject)
			})
				.then(() => ({ success: true }))
				.catch(() => ({ success: false }))
		},
	)

	controller.addHandler<ReplaceHistoryStateParams, ReplaceHistoryStateData>(
		'condo-bridge',
		'CondoWebAppReplaceHistoryState',
		'*',
		zodSchemaToValidator(HISTORY_STATE_SCHEMA),
		async ({ params }) => {
			const cordovaHandler = window.cordova?.plugins?.condo?.history?.replaceState
			if (typeof cordovaHandler !== 'function') {
				throw new Error('Unsupported cordova method (history.replaceState)')
			}

			const wrappedState: InternalHistoryState = {
				__state: params.state ?? null,
				__title: params.title ?? null,
			}

			return new Promise((resolve, reject) => {
				cordovaHandler(wrappedState, params.title ?? null, resolve, reject)
			})
				.then(() => ({ success: true }))
				.catch(() => ({ success: false }))
		},
	)

	controller.addHandler<PopHistoryStateParams, PopHistoryStateData>(
		'condo-bridge',
		'CondoWebAppPopHistoryState',
		'*',
		zodSchemaToValidator(z.strictObject({ amount: z.int().nonnegative().optional() })),
		async ({ params }) => {
			const cordovaHandler = window.cordova?.plugins?.condo?.history?.go
			if (typeof cordovaHandler !== 'function') {
				throw new Error('Unsupported cordova method (history.go)')
			}

			const amount = params.amount ?? 1

			return new Promise((resolve, reject) => {
				cordovaHandler(-amount, resolve, reject)
			})
				.then(() => ({ success: true }))
				.catch(() => ({ success: false }))
		},
	)

	controller.addMiddleware<RequestAuthParams, RequestAuthData>({
		eventType: 'condo-bridge',
		eventName: 'CondoWebAppRequestAuth',
		scope: '*',
		fn: async ({ next, params }) => {
			const cordovaHandler = window.cordova?.plugins?.condo?.requestServerAuthorizationByUrl
			if (typeof cordovaHandler !== 'function') {
				return next()
			}

			return new Promise((resolve, reject) => {
				cordovaHandler(params.url, {}, resolve, reject)
			}).then((result) => {
				const data = AUTH_RESPONSE_SCHEMA.parse(result)
				return { response: { status: data.status, url: data.url, body: data.body ?? '' } }
			})
		},
	})
}

export function subscribeToCordovaEvents(): CleanupFn {
	if (
		typeof window === 'undefined' ||
		typeof document === 'undefined' ||
		typeof document.addEventListener !== 'function'
	) {
		return () => ({})
	}

	const backButtonListener = () => {
		const eventData: CondoBridgeIncomingEvent<'CondoWebAppBackButton'> = {
			type: 'CondoWebAppBackButtonEvent',
			data: {},
		}

		window.postMessage(eventData, window.location.origin)
	}

	const condoPopstateInterceptor = (event: any) => {
		if (!('state' in event)) return
		const { success, data } = INTERNAL_HISTORY_STATE_SCHEMA.safeParse(event.state)
		if (!success) return

		event.stopImmediatePropagation()

		const eventData: CondoBridgeIncomingEvent<'CondoWebAppHistoryPopState'> = {
			type: 'CondoWebAppHistoryPopStateEvent',
			data: {
				state: data?.__state ?? null,
				title: data?.__title ?? null,
			},
		}

		window.postMessage(eventData, window.location.origin)

		const unwrapped = new PopStateEvent('condoPopstate', {
			bubbles: event.bubbles,
			cancelable: event.cancelable,
			state: data.__state ?? null,
		})
		window.dispatchEvent(unwrapped)
	}

	document.addEventListener('backbutton', backButtonListener)
	window.addEventListener('condoPopstate', condoPopstateInterceptor, { capture: true })

	return () => {
		document.removeEventListener('backbutton', backButtonListener)
		window.removeEventListener('condoPopstate', condoPopstateInterceptor, { capture: true })
	}
}
