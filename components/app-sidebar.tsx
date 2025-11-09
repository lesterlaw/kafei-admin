'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  UserCog,
  CreditCard,
  Receipt,
  Package,
  ShoppingCart,
  Gift,
  Ticket,
  Coffee,
  MapPin,
  HeadphonesIcon,
  Bell,
  FileText,
  Settings,
  LogOut,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { signOut } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'

const navItems = [
  {
    title: 'Main',
    items: [
      {
        title: 'Dashboard',
        url: '/dashboard',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: 'Management',
    items: [
      {
        title: 'Admin Management',
        url: '/dashboard/admin-management',
        icon: UserCog,
      },
      {
        title: 'Users',
        url: '/dashboard/users',
        icon: Users,
      },
      {
        title: 'Subscriptions',
        url: '/dashboard/subscriptions',
        icon: Package,
      },
      {
        title: 'Products',
        url: '/dashboard/products',
        icon: Coffee,
      },
      {
        title: 'Orders',
        url: '/dashboard/orders',
        icon: ShoppingCart,
      },
      {
        title: 'Kiosks',
        url: '/dashboard/kiosks',
        icon: MapPin,
      },
    ],
  },
  {
    title: 'Payments & Rewards',
    items: [
      {
        title: 'Payments',
        url: '/dashboard/payments',
        icon: CreditCard,
      },
      {
        title: 'Transactions',
        url: '/dashboard/transactions',
        icon: Receipt,
      },
      {
        title: 'Rewards & Referrals',
        url: '/dashboard/rewards-referrals',
        icon: Gift,
      },
      {
        title: 'Coupons',
        url: '/dashboard/coupons',
        icon: Ticket,
      },
    ],
  },
  {
    title: 'Content & Support',
    items: [
      {
        title: 'Support Tickets',
        url: '/dashboard/support',
        icon: HeadphonesIcon,
      },
      {
        title: 'Notifications',
        url: '/dashboard/notifications',
        icon: Bell,
      },
      {
        title: 'Subpages',
        url: '/dashboard/subpages',
        icon: FileText,
      },
    ],
  },
  {
    title: 'Settings',
    items: [
      {
        title: 'Settings',
        url: '/dashboard/settings',
        icon: Settings,
      },
    ],
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()

  const handleSignOut = async () => {
    await signOut()
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-4 py-2">
          <Coffee className="h-6 w-6" />
          <span className="text-lg font-semibold">Kafei Admin</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navItems.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.url
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.url}>
                          <Icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <div className="border-t border-sidebar-border p-4">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={handleSignOut}
        >
          <LogOut />
          <span>Logout</span>
        </Button>
      </div>
      <SidebarRail />
    </Sidebar>
  )
}
