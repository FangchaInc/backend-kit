import assert from '@fangcha/assert'
import { PermissionProtocol } from '../basic'

class __TinyApp implements PermissionProtocol {
  public baseURL: string = ''

  public checkUserIsAdmin = (_email: string) => {
    return false
  }

  public checkUserHasPermission = (_email: string, _permissionKey: string) => {
    return true
  }

  public assertUserIsAdmin(email: string) {
    assert.ok(this.checkUserIsAdmin(email), `${email} 必须为应用的管理员`, 403)
  }

  public assertUserHasPermission(email: string, permissionKey: string) {
    assert.ok(this.checkUserHasPermission(email, permissionKey), `${email} 不具备权限 "${permissionKey}"`, 403)
  }

  public setPermissionProtocol(protocol: PermissionProtocol) {
    this.checkUserIsAdmin = protocol.checkUserIsAdmin
    this.checkUserHasPermission = protocol.checkUserHasPermission
  }
}

export const _TinyApp = new __TinyApp()
