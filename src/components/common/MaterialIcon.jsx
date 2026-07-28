import { Icon as IconifyIcon } from '@iconify/react'
import accountBalanceWallet from '@iconify-icons/material-symbols/account-balance-wallet'
import accountBalance from '@iconify-icons/material-symbols/account-balance'
import autoAwesome from '@iconify-icons/material-symbols/auto-awesome'
import barChart from '@iconify-icons/material-symbols/bar-chart'
import calendarMonth from '@iconify-icons/material-symbols/calendar-month'
import checkCircle from '@iconify-icons/material-symbols/check-circle'
import clearAll from '@iconify-icons/material-symbols/clear-all'
import collectionsBookmark from '@iconify-icons/material-symbols/collections-bookmark'
import compareArrows from '@iconify-icons/material-symbols/compare-arrows'
import expandMore from '@iconify-icons/material-symbols/expand-more'
import help from '@iconify-icons/material-symbols/help'
import helpCenter from '@iconify-icons/material-symbols/help-center'
import info from '@iconify-icons/material-symbols/info'
import insights from '@iconify-icons/material-symbols/insights'
import layers from '@iconify-icons/material-symbols/layers'
import monitoring from '@iconify-icons/material-symbols/monitoring'
import pieChart from '@iconify-icons/material-symbols/pie-chart'
import priceCheck from '@iconify-icons/material-symbols/price-check'
import receiptLong from '@iconify-icons/material-symbols/receipt-long'
import schedule from '@iconify-icons/material-symbols/schedule'
import security from '@iconify-icons/material-symbols/security'
import showChart from '@iconify-icons/material-symbols/show-chart'
import stars from '@iconify-icons/material-symbols/stars'
import stadiaController from '@iconify-icons/material-symbols/stadia-controller'
import verified from '@iconify-icons/material-symbols/verified'
import warning from '@iconify-icons/material-symbols/warning'

const ICONS = {
  account_balance: accountBalance,
  account_balance_wallet: accountBalanceWallet,
  auto_awesome: autoAwesome,
  bar_chart: barChart,
  calendar_month: calendarMonth,
  check_circle: checkCircle,
  clear_all: clearAll,
  collections_bookmark: collectionsBookmark,
  compare_arrows: compareArrows,
  expand_more: expandMore,
  help,
  help_center: helpCenter,
  info,
  insights,
  layers,
  monitoring,
  pie_chart: pieChart,
  price_check: priceCheck,
  receipt_long: receiptLong,
  schedule,
  security,
  show_chart: showChart,
  stars,
  stadia_controller: stadiaController,
  verified,
  warning,
}

export function MaterialIcon({ icon, fill: _fill, className = '', ...props }) {
  const data = ICONS[icon] || ICONS.help

  return (
    <IconifyIcon
      icon={data}
      className={`material-icon inline-block align-middle ${className}`}
      aria-hidden={props['aria-hidden'] ?? true}
      {...props}
    />
  )
}
