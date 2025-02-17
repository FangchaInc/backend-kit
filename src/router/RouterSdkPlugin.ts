import * as Koa from 'koa'
import { Context } from 'koa'
import { RouterSdkOptions } from './RouterSdkOptions'
import { WriteLogMiddlewareBuilder } from '@fangcha/logger/lib/koa'
import AppError from '@fangcha/app-error'
import { logger } from '@fangcha/logger'
import assert from '@fangcha/assert'
import { AppPluginProtocol } from '../basic'
import { _SessionApp, FangchaAdminSession, FangchaOpenSession, FangchaSession } from '@fangcha/router/lib/session'
import { _FangchaState } from '../main'

const compose = require('koa-compose')
const bodyParser = require('koa-body')

export const RouterSdkPlugin = (options: RouterSdkOptions): AppPluginProtocol => {
  _SessionApp.baseURL = options.baseURL

  assert.ok(
    !(options.jwtProtocol && options.basicAuthProtocol),
    'jwtProtocol and basicAuthProtocol can only pass one',
    500
  )

  if (options.jwtProtocol) {
    _SessionApp.setJWTProtocol(options.jwtProtocol)
  }
  if (options.basicAuthProtocol) {
    _SessionApp.basicAuthProtocol = options.basicAuthProtocol
  }

  return {
    appDidLoad: (app) => {
      const koaApp = new Koa()

      const onRequestError =
        options.onRequestError ||
        ((err, ctx: Koa.Context) => {
          console.error(err)
          if (ctx.status >= 500) {
            const session = ctx.session as FangchaSession
            _FangchaState.botProxy.notifyApiError({
              api: ctx.path || '',
              errorMsg: err.message,
              method: (ctx.method || '').toUpperCase(),
              statusCode: ctx.status,
              user: session.curUserStr(),
              ipAddress: session.realIP,
              duration: ctx.duration,
              reqid: session.reqid || '-',
              referer: ctx.headers.referer || '-',
            })
          }
        })
      koaApp.on('error', onRequestError)

      const routerApp = options.routerApp

      for (const plugin of app.plugins) {
        const specDocItems = plugin.specDocItems || []
        specDocItems.forEach((item) => {
          options.routerApp.addDocItem(item)
        })
      }

      const codeVersion = process.env.CODE_VERSION || 'Unknown'
      const writeLogMiddlewareBuilder = options.customWriteLogMiddlewareBuilder || new WriteLogMiddlewareBuilder()

      if (options.jwtProtocol && !options.Session) {
        options.Session = FangchaAdminSession
      }
      if (options.basicAuthProtocol && !options.Session) {
        options.Session = FangchaOpenSession
      }
      const sessionClazz = options.Session || FangchaSession
      koaApp.use(
        compose([
          ...routerApp.getMiddlewaresBeforeInit(),

          async (ctx: Context, next: Function) => {
            ctx.set('x-code-version', codeVersion)
            ctx.session = new sessionClazz(ctx)
            ctx.logger = ctx.session.logger
            await next()
          },

          writeLogMiddlewareBuilder.build(),

          async (ctx: Context, next: Function) => {
            const parser = bodyParser({ multipart: true })
            try {
              await parser(ctx, () => {})
            } catch (e) {
              console.error(e)
              throw new AppError(`JSON parse error. ${(e as Error).message}`, 400)
            }
            await next()
          },

          ...routerApp.getPreHandleMiddlewares(),

          // 暴露公开 api
          routerApp.makePublicRouterMiddleware(),

          async (ctx: Context, next: Function) => {
            const handleAuth =
              options.handleAuth ||
              (async (ctx) => {
                const session = ctx.session as FangchaSession
                await session.auth()
              })
            await handleAuth(ctx)
            await next()
          },

          routerApp.makePrivateRouterMiddleware(),
        ])
      )

      const onKoaAppLaunched =
        options.onKoaAppLaunched ||
        (() => {
          // _FangchaState.botProxy.notify(`[${_FangchaState.tags.join(', ')}] App launched.`)
          logger.info(`[${_FangchaState.env}] Backend service listening on port ${options.backendPort}!`)
        })

      const server = koaApp.listen(options.backendPort, () => {
        onKoaAppLaunched()
      })
      if (options.serverTimeout) {
        server.setTimeout(options.serverTimeout)
      }
    },
  }
}
