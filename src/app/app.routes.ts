import { Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { CdpComponent } from './pages/cdp/cdp.component';
import { PurchaseOrdersComponent } from './pages/purchase-orders/purchase-orders.component';
import { ImportsComponent } from './pages/imports/imports.component';
import { GenericMaintainerComponent } from './pages/generic-maintainer/generic-maintainer.component';
import { AuditLogsComponent } from './pages/audit-logs/audit-logs.component';
import { LoginComponent } from './pages/login/login.component';
import { authGuard } from './core/auth.guard';
import { QuadratureComponent } from './pages/quadrature/quadrature.component';
import { ReportsComponent } from './pages/reports/reports.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', component: DashboardComponent },
      {
        path: 'programas',
        component: GenericMaintainerComponent,
        data: { config: { title: 'Programas presupuestarios', subtitle: 'Mantenedores / Programas presupuestarios. Permite crear, editar, eliminar lógicamente, recuperar y exportar programas.', path: '/programs', exportName: 'programas_presupuestarios', searchPlaceholder: 'Buscar programa presupuestario', fields: [
          { key: 'name', label: 'Programa', required: true },
          { key: 'code', label: 'Código' },
          { key: 'subtitle', label: 'Subtítulo' },
          { key: 'initialBudget', label: 'Presupuesto inicial', type: 'number' },
          { key: 'currentBudget', label: 'Presupuesto vigente', type: 'number' },
          { key: 'description', label: 'Descripción', type: 'textarea', table: false }
        ] } }
      },
      {
        path: 'proveedores',
        component: GenericMaintainerComponent,
        data: { config: { title: 'Proveedores', subtitle: 'Mantenedores / Proveedores. Catálogo único con eliminación lógica, recuperación y exportación por ventana o filtro.', path: '/providers', exportName: 'proveedores', searchPlaceholder: 'Buscar proveedor', fields: [
          { key: 'rut', label: 'RUT', required: true },
          { key: 'businessName', label: 'Razón social', required: true },
          { key: 'fantasyName', label: 'Nombre fantasía' },
          { key: 'lineOfBusiness', label: 'Giro', table: false },
          { key: 'email', label: 'Correo' },
          { key: 'phone', label: 'Teléfono' }
        ] } }
      },
      { path: 'cdp', component: CdpComponent },
      { path: 'ordenes-compra', component: PurchaseOrdersComponent },
      { path: 'importaciones', component: ImportsComponent },
      { path: 'cuadratura', component: QuadratureComponent },
      { path: 'reportes', component: ReportsComponent },
      { path: 'auditoria', component: AuditLogsComponent },
      {
        path: 'items-presupuestarios',
        component: GenericMaintainerComponent,
        data: { config: { title: 'Ítems presupuestarios', subtitle: 'Mantenedores / Ítems presupuestarios. Catálogo de códigos, nombres, subtítulos y descripciones asociados a la ejecución.', path: '/budget-items', exportName: 'items_presupuestarios', searchPlaceholder: 'Buscar ítem presupuestario', fields: [
          { key: 'code', label: 'Código', required: true },
          { key: 'name', label: 'Nombre', required: true },
          { key: 'subtitle', label: 'Subtítulo' },
          { key: 'description', label: 'Descripción', type: 'textarea' }
        ] } }
      },
      {
        path: 'tipos-cdp',
        component: GenericMaintainerComponent,
        data: { config: { title: 'Tipos de CDP', subtitle: 'Mantenedores / Tipos de CDP. Permite parametrizar contratos, licitaciones, convenios marco, compra ágil u otros tipos.', path: '/cdp-types', exportName: 'tipos_cdp', searchPlaceholder: 'Buscar tipo de CDP', fields: [
          { key: 'code', label: 'Código' },
          { key: 'name', label: 'Nombre', required: true },
          { key: 'description', label: 'Descripción', type: 'textarea' }
        ] } }
      },
      {
        path: 'estados-oc',
        component: GenericMaintainerComponent,
        data: { config: { title: 'Estados de OC', subtitle: 'Mantenedores / Estados de órdenes de compra. Catálogo para normalizar estados de emisión, anulación, cierre y seguimiento.', path: '/purchase-order-states', exportName: 'estados_oc', searchPlaceholder: 'Buscar estado de OC', fields: [
          { key: 'code', label: 'Código' },
          { key: 'name', label: 'Nombre', required: true },
          { key: 'description', label: 'Descripción', type: 'textarea' }
        ] } }
      },
      {
        path: 'subtitulos-presupuestarios',
        component: GenericMaintainerComponent,
        data: { config: { title: 'Subtítulos presupuestarios', subtitle: 'Mantenedores / Subtítulos presupuestarios. Catálogo de clasificación presupuestaria institucional.', path: '/budget-subtitles', exportName: 'subtitulos_presupuestarios', searchPlaceholder: 'Buscar subtítulo presupuestario', fields: [
          { key: 'code', label: 'Código', required: true },
          { key: 'name', label: 'Nombre', required: true },
          { key: 'description', label: 'Descripción', type: 'textarea' }
        ] } }
      },
      {
        path: 'roles',
        component: GenericMaintainerComponent,
        data: { config: { title: 'Roles', subtitle: 'Administración / Roles. Base para seguridad y autorización por perfil funcional.', path: '/roles', exportName: 'roles', searchPlaceholder: 'Buscar rol', fields: [
          { key: 'name', label: 'Nombre', required: true },
          { key: 'description', label: 'Descripción', type: 'textarea' }
        ] } }
      },
      {
        path: 'usuarios',
        component: GenericMaintainerComponent,
        data: { config: { title: 'Usuarios', subtitle: 'Administración / Usuarios. Mantenedor inicial de usuarios y roles declarativos para el MVP.', path: '/users', exportName: 'usuarios', searchPlaceholder: 'Buscar usuario', fields: [
          { key: 'username', label: 'Usuario', required: true },
          { key: 'fullName', label: 'Nombre completo', required: true },
          { key: 'email', label: 'Correo' },
          { key: 'passwordHash', label: 'Contraseña temporal', type: 'password', table: false },
          { key: 'rolesText', label: 'Roles', type: 'textarea' }
        ] } }
      }
    ]
  }
];
