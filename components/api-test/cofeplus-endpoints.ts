export type FieldType = 'text' | 'number' | 'select' | 'textarea' | 'json'

export interface EndpointField {
  name: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string
  defaultValue?: string
  options?: { label: string; value: string }[]
  help?: string
  /** Where the value is applied */
  in: 'path' | 'query' | 'header' | 'body'
}

export interface ApiEndpoint {
  id: string
  group: 'health' | 'pods' | 'menu' | 'dispatches' | 'orders' | 'oam'
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  title: string
  description: string
  requiresAuth?: boolean
  contentType?: string
  fields: EndpointField[]
  /** Static / default JSON body when no dedicated body field overrides it */
  defaultBody?: string
}

export const DEFAULT_DISPATCH_BODY = `{
  "pricing": {
    "total": 0,
    "ccy": "SGD",
    "charges": []
  },
  "lang": "en",
  "itemCount": 1,
  "channel": "mobile",
  "deliveryPort": 1,
  "lineItems": [
    {
      "qty": 1,
      "price": 0,
      "itemCode": "",
      "modifiers": [],
      "displayNote": "Test drink from Kafei admin"
    }
  ]
}`

export const DEFAULT_OAM_POD_PATCH = `{
  "displayName": "Updated Pod Name"
}`

export const DEFAULT_JSON_PATCH = `[
  {
    "op": "replace",
    "path": "/0/display",
    "value": "Updated value"
  }
]`

export const DEFAULT_I18N_UPDATE = `[
  {
    "uri": "l10n:example.key",
    "lang": "en",
    "value": "Updated text"
  }
]`

export const COFEPLUS_ENDPOINTS: ApiEndpoint[] = [
  // Health
  {
    id: 'health-liveness',
    group: 'health',
    method: 'GET',
    path: '/health/liveness',
    title: 'Liveness',
    description: 'Service liveness probe (no auth).',
    requiresAuth: false,
    fields: [],
  },
  {
    id: 'health-readiness',
    group: 'health',
    method: 'GET',
    path: '/health/readiness',
    title: 'Readiness',
    description: 'Service readiness probe (no auth).',
    requiresAuth: false,
    fields: [],
  },

  // Pods
  {
    id: 'list-pods',
    group: 'pods',
    method: 'GET',
    path: '/partner/v1/pods',
    title: 'List pods',
    description: 'List all pods available to the partner token.',
    fields: [],
  },
  {
    id: 'fetch-pod',
    group: 'pods',
    method: 'GET',
    path: '/partner/v1/pods/{podId}',
    title: 'Fetch pod',
    description: 'Fetch a single pod summary.',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
        placeholder: 'Machine serial / pod ID',
      },
    ],
  },
  {
    id: 'fetch-pod-status',
    group: 'pods',
    method: 'GET',
    path: '/partner/v1/pods/{podId}/status',
    title: 'Fetch pod status',
    description: 'Returns plain text OK or NOT OK.',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
    ],
  },

  // Menu & items
  {
    id: 'list-menu',
    group: 'menu',
    method: 'GET',
    path: '/partner/v1/menus/{podId}',
    title: 'List menu',
    description: 'Partner menu categories and items for a pod.',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'lang',
        label: 'Language',
        type: 'text',
        in: 'query',
        placeholder: 'en',
        defaultValue: 'en',
      },
    ],
  },
  {
    id: 'fetch-pod-menu',
    group: 'menu',
    method: 'GET',
    path: '/partner/v1/pods/{podId}/menu',
    title: 'Fetch pod menu',
    description: 'Alternate menu route (uses display for category names).',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'lang',
        label: 'Language',
        type: 'text',
        in: 'query',
        placeholder: 'en',
        defaultValue: 'en',
      },
    ],
  },
  {
    id: 'list-pod-items',
    group: 'menu',
    method: 'GET',
    path: '/partner/v1/pods/{podId}/items',
    title: 'List pod items',
    description: 'List all items available on a pod.',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'lang',
        label: 'Language',
        type: 'text',
        in: 'query',
        placeholder: 'en',
        defaultValue: 'en',
      },
    ],
  },
  {
    id: 'fetch-item',
    group: 'menu',
    method: 'GET',
    path: '/partner/v1/items/{podId}/{code}',
    title: 'Fetch item',
    description: 'Fetch a single item by product code.',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'code',
        label: 'Item code',
        type: 'text',
        required: true,
        in: 'path',
        placeholder: 'DJ202016220002',
      },
      {
        name: 'lang',
        label: 'Language',
        type: 'text',
        in: 'query',
        placeholder: 'en',
        defaultValue: 'en',
      },
    ],
  },
  {
    id: 'fetch-pod-item',
    group: 'menu',
    method: 'GET',
    path: '/partner/v1/pods/{podId}/items/{itemCode}',
    title: 'Fetch pod item',
    description: 'Alternate item fetch under the pod items route.',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'itemCode',
        label: 'Item code',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'lang',
        label: 'Language',
        type: 'text',
        in: 'query',
        placeholder: 'en',
        defaultValue: 'en',
      },
    ],
  },

  // Dispatches
  {
    id: 'create-dispatch',
    group: 'dispatches',
    method: 'POST',
    path: '/partner/v1/dispatches/{podId}',
    title: 'Create dispatch',
    description:
      'Create a coffee order. Use mode=immediate to start brewing, or pickup for later redemption.',
    defaultBody: DEFAULT_DISPATCH_BODY,
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'mode',
        label: 'Mode',
        type: 'select',
        required: true,
        in: 'query',
        defaultValue: 'immediate',
        options: [
          { label: 'immediate — start fulfillment now', value: 'immediate' },
          { label: 'pickup — create pending pickup order', value: 'pickup' },
        ],
      },
      {
        name: 'Idempotency-Key',
        label: 'Idempotency-Key',
        type: 'text',
        in: 'header',
        help: 'Optional. Same key + same body replays the first success.',
        placeholder: 'kafei-test-001',
      },
      {
        name: 'body',
        label: 'Request body (DispatchDto)',
        type: 'json',
        required: true,
        in: 'body',
        defaultValue: DEFAULT_DISPATCH_BODY,
      },
    ],
  },
  {
    id: 'fetch-dispatch',
    group: 'dispatches',
    method: 'GET',
    path: '/partner/v1/dispatches/{podId}/{orderId}',
    title: 'Fetch dispatch',
    description: 'Live dispatch status (pending → accepted → making → ready → done / failed).',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'orderId',
        label: 'Order ID',
        type: 'text',
        required: true,
        in: 'path',
        help: 'Stable id returned by create dispatch.',
      },
    ],
  },

  // Orders (history)
  {
    id: 'query-orders',
    group: 'orders',
    method: 'GET',
    path: '/partner/v1/orders',
    title: 'Query order history',
    description: 'Paginated archived order history.',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID(s)',
        type: 'text',
        required: true,
        in: 'query',
        help: 'Comma-separated for multiple pods.',
        placeholder: 'POD_SERIAL',
      },
      {
        name: 'from',
        label: 'From (ISO 8601)',
        type: 'text',
        required: true,
        in: 'query',
        placeholder: '2026-07-01T00:00:00Z',
      },
      {
        name: 'to',
        label: 'To (ISO 8601, exclusive)',
        type: 'text',
        required: true,
        in: 'query',
        placeholder: '2026-07-21T00:00:00Z',
      },
      {
        name: 'state',
        label: 'State filter',
        type: 'text',
        in: 'query',
        help: 'Comma-separated: pending,accepted,making,ready,done,failed',
      },
      {
        name: 'limit',
        label: 'Limit',
        type: 'number',
        in: 'query',
        defaultValue: '20',
      },
      {
        name: 'cursor',
        label: 'Cursor',
        type: 'text',
        in: 'query',
      },
      {
        name: 'paymentRef',
        label: 'Payment ref',
        type: 'text',
        in: 'query',
      },
      {
        name: 'isRefunded',
        label: 'Is refunded',
        type: 'select',
        in: 'query',
        options: [
          { label: '(any)', value: '' },
          { label: 'true', value: 'true' },
          { label: 'false', value: 'false' },
        ],
      },
    ],
  },
  {
    id: 'export-orders',
    group: 'orders',
    method: 'GET',
    path: '/partner/v1/orders/export',
    title: 'Export order history',
    description: 'NDJSON export of archived orders.',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID(s)',
        type: 'text',
        required: true,
        in: 'query',
        help: 'Comma-separated for multiple pods.',
      },
      {
        name: 'from',
        label: 'From (ISO 8601)',
        type: 'text',
        required: true,
        in: 'query',
      },
      {
        name: 'to',
        label: 'To (ISO 8601, exclusive)',
        type: 'text',
        required: true,
        in: 'query',
      },
      {
        name: 'state',
        label: 'State filter',
        type: 'text',
        in: 'query',
      },
      {
        name: 'paymentRef',
        label: 'Payment ref',
        type: 'text',
        in: 'query',
      },
      {
        name: 'isRefunded',
        label: 'Is refunded',
        type: 'select',
        in: 'query',
        options: [
          { label: '(any)', value: '' },
          { label: 'true', value: 'true' },
          { label: 'false', value: 'false' },
        ],
      },
    ],
  },
  {
    id: 'fetch-order-history',
    group: 'orders',
    method: 'GET',
    path: '/partner/v1/pods/{podId}/orders/{orderId}',
    title: 'Fetch archived order',
    description: 'Fetch a single archived order by pod + order id.',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'orderId',
        label: 'Order ID',
        type: 'text',
        required: true,
        in: 'path',
      },
    ],
  },

  // OAM (admin / menu ops)
  {
    id: 'oam-patch-pod',
    group: 'oam',
    method: 'PATCH',
    path: '/oam/v1/pods/{podId}',
    title: 'Patch OAM pod settings',
    description: 'Merge-patch pod settings. Content-Type: application/merge-patch+json',
    contentType: 'application/merge-patch+json',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'body',
        label: 'Merge patch body',
        type: 'json',
        required: true,
        in: 'body',
        defaultValue: DEFAULT_OAM_POD_PATCH,
      },
    ],
  },
  {
    id: 'oam-get-menu',
    group: 'oam',
    method: 'GET',
    path: '/oam/v1/pods/{podId}/menu',
    title: 'Get OAM menu document',
    description: 'Editable OAM menu document.',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
    ],
  },
  {
    id: 'oam-patch-menu',
    group: 'oam',
    method: 'PATCH',
    path: '/oam/v1/pods/{podId}/menu',
    title: 'Patch OAM menu',
    description: 'JSON Patch against the editable menu document.',
    contentType: 'application/json-patch+json',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'body',
        label: 'JSON Patch body',
        type: 'json',
        required: true,
        in: 'body',
        defaultValue: DEFAULT_JSON_PATCH,
      },
    ],
  },
  {
    id: 'oam-get-i18n',
    group: 'oam',
    method: 'GET',
    path: '/oam/v1/i18n',
    title: 'Get localization',
    description: 'Fetch localization dictionary.',
    fields: [
      {
        name: 'uri',
        label: 'URI filter',
        type: 'text',
        in: 'query',
        help: 'Comma-separated localization URIs.',
      },
      {
        name: 'lang',
        label: 'Lang filter',
        type: 'text',
        in: 'query',
        help: 'Comma-separated BCP 47 tags.',
      },
    ],
  },
  {
    id: 'oam-patch-i18n',
    group: 'oam',
    method: 'PATCH',
    path: '/oam/v1/i18n',
    title: 'Update localization',
    description: 'Update existing localization values (does not create new URIs).',
    fields: [
      {
        name: 'body',
        label: 'Update body',
        type: 'json',
        required: true,
        in: 'body',
        defaultValue: DEFAULT_I18N_UPDATE,
      },
    ],
  },
  {
    id: 'oam-put-i18n',
    group: 'oam',
    method: 'PUT',
    path: '/oam/v1/i18n',
    title: 'Replace localization',
    description: 'Create or replace localization values.',
    fields: [
      {
        name: 'body',
        label: 'Replace body',
        type: 'json',
        required: true,
        in: 'body',
        defaultValue: DEFAULT_I18N_UPDATE,
      },
    ],
  },
  {
    id: 'oam-list-items',
    group: 'oam',
    method: 'GET',
    path: '/oam/v1/pods/{podId}/items',
    title: 'List editable items',
    description: 'OAM editable item documents for a pod.',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
    ],
  },
  {
    id: 'oam-patch-items',
    group: 'oam',
    method: 'PATCH',
    path: '/oam/v1/pods/{podId}/items',
    title: 'Patch item collection',
    description: 'JSON Patch against the item collection.',
    contentType: 'application/json-patch+json',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'body',
        label: 'JSON Patch body',
        type: 'json',
        required: true,
        in: 'body',
        defaultValue: DEFAULT_JSON_PATCH,
      },
    ],
  },
  {
    id: 'oam-get-item',
    group: 'oam',
    method: 'GET',
    path: '/oam/v1/pods/{podId}/items/{itemCode}',
    title: 'Get editable item',
    description: 'Fetch a single editable item document.',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'itemCode',
        label: 'Item code',
        type: 'text',
        required: true,
        in: 'path',
      },
    ],
  },
  {
    id: 'oam-patch-item',
    group: 'oam',
    method: 'PATCH',
    path: '/oam/v1/pods/{podId}/items/{itemCode}',
    title: 'Patch editable item',
    description: 'JSON Patch a single item.',
    contentType: 'application/json-patch+json',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'itemCode',
        label: 'Item code',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'body',
        label: 'JSON Patch body',
        type: 'json',
        required: true,
        in: 'body',
        defaultValue: DEFAULT_JSON_PATCH,
      },
    ],
  },
  {
    id: 'oam-put-item',
    group: 'oam',
    method: 'PUT',
    path: '/oam/v1/pods/{podId}/items/{itemCode}',
    title: 'Create/replace non-product item',
    description: 'Create or replace a non-product (placeholder) item.',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'itemCode',
        label: 'Item code',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'body',
        label: 'Item body',
        type: 'json',
        required: true,
        in: 'body',
        defaultValue: `{
  "itemCode": "ADVERT_001",
  "display": "Promo placeholder",
  "isProduct": false,
  "price": 0
}`,
      },
    ],
  },
  {
    id: 'oam-delete-item',
    group: 'oam',
    method: 'DELETE',
    path: '/oam/v1/pods/{podId}/items/{itemCode}',
    title: 'Delete non-product item',
    description: 'Delete a non-product item (fails if still referenced by menu).',
    fields: [
      {
        name: 'podId',
        label: 'Pod ID',
        type: 'text',
        required: true,
        in: 'path',
      },
      {
        name: 'itemCode',
        label: 'Item code',
        type: 'text',
        required: true,
        in: 'path',
      },
    ],
  },
]

export const ENDPOINT_GROUPS = [
  { id: 'health', label: 'Health' },
  { id: 'pods', label: 'Pods' },
  { id: 'menu', label: 'Menu & Items' },
  { id: 'dispatches', label: 'Dispatches' },
  { id: 'orders', label: 'Orders' },
  { id: 'oam', label: 'OAM' },
] as const
