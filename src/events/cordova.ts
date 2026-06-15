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
	RequestAuthParams,
	RequestAuthData,
} from '@open-condo/bridge'

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
const DEFAULT_LOCALE = 'ru_RU'

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
