"use client"

import { Home, Briefcase } from "lucide-react"
import { NavBar } from "@/components/ui/tubelight-navbar"

export function NavBarDemo() {
  const navItems = [
    { name: "Home", url: "/", icon: Home },
    { name: "Quiz", url: "/quiz", icon: Briefcase },
  ]

  return <NavBar items={navItems} />
}
