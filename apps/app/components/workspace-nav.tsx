"use client";

import { useAppShellNav } from "@crm/ui/components/app-shell";
import {
	AppSidebar,
	AppSidebarGroup,
	AppSidebarItem,
	AppSidebarSection,
	AppSidebarSkeleton,
	AppSidebarWorkspace,
} from "@crm/ui/components/app-sidebar";
import { DropdownMenuItem } from "@crm/ui/components/dropdown-menu";
import { WorkspaceSwitcher } from "@crm/ui/components/workspace-switcher";
import { useQuery } from "@tanstack/react-query";
import {
	KanbanIcon,
	LayoutDashboardIcon,
	ListChecksIcon,
	type LucideIcon,
	PackageIcon,
	SettingsIcon,
	ShipIcon,
	UserPlusIcon,
	UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AgentChatNav } from "@/components/agent-builder/agent-builder-sidebar";
import { usePrefetchSection } from "@/components/crm/section-prefetch";
import { useTRPC } from "@/lib/trpc/client";
import { useWorkspaceUrl } from "@/lib/use-workspace-url";

type NavItem = {
	title: string;
	href: string;
	icon: LucideIcon;
	match: "exact" | "prefix";
	related?: string[];
};

type WorkspaceData = {
	id: string;
	slug: string;
	name: string;
	website: string | null;
	onboarded: boolean;
	viewerRole: "owner" | "member" | "admin" | null;
	canRename: boolean;
	canChangeRoles: boolean;
};

const PRIMARY: NavItem[] = [
	{ title: "Resumen", href: "/", icon: LayoutDashboardIcon, match: "exact" },
	{ title: "Contactos", href: "/contacts", icon: UsersIcon, match: "prefix" },
	{ title: "Funnel", href: "/funnel", icon: KanbanIcon, match: "prefix" },
	{ title: "Productos", href: "/products", icon: PackageIcon, match: "prefix" },
	{ title: "Importaciones", href: "/imports", icon: ShipIcon, match: "prefix" },
	{ title: "Tareas", href: "/tasks", icon: ListChecksIcon, match: "prefix" },
];

const SETTINGS: NavItem = {
	title: "Configuración",
	href: "/settings",
	icon: SettingsIcon,
	match: "prefix",
};

const SETTINGS_PAGES: { title: string; href: string }[] = [
	{ title: "General", href: "/settings" },
	{ title: "Seguimiento y analítica", href: "/settings/tracking" },
	{ title: "Conexiones", href: "/settings/connections" },
	{ title: "Monedas", href: "/settings/currencies" },
	{ title: "Orígenes", href: "/settings/lead-sources" },
	{ title: "Etapas", href: "/settings/stages" },
	{ title: "Procesos de importación", href: "/settings/import-processes" },
	{ title: "Etiquetas de documentos", href: "/settings/document-labels" },
	{ title: "Miembros", href: "/settings/members" },
	{ title: "Claves de API", href: "/settings/api-keys" },
	{ title: "SSO", href: "/settings/sso" },
];

const WORKSPACE_ACTIONS: { title: string; href: string; icon: LucideIcon }[] = [
	{ title: "Configuración del espacio", href: "/settings", icon: SettingsIcon },
	{ title: "Miembros", href: "/settings/members", icon: UserPlusIcon },
];

function startsWithSegment(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`);
}

function isActive(item: NavItem, pathname: string): boolean {
	return (
		pathname === item.href ||
		(item.match === "prefix" && startsWithSegment(pathname, item.href)) ||
		Boolean(item.related?.some((prefix) => startsWithSegment(pathname, prefix)))
	);
}

function WorkspaceHeader({
	initialWorkspace,
}: {
	initialWorkspace?: WorkspaceData;
}) {
	const trpc = useTRPC();
	const router = useRouter();
	const workspaceUrl = useWorkspaceUrl();
	const nav = useAppShellNav();
	const workspace = useQuery({
		...trpc.workspace.get.queryOptions(),
		initialData: initialWorkspace,
	});

	if (!workspace.data) {
		return (
			<AppSidebarWorkspace
				name="Espacio de trabajo"
				loading={workspace.isPending}
			/>
		);
	}

	const { id, slug, name } = workspace.data;

	return (
		<WorkspaceSwitcher
			workspaces={[
				{ id, slug, name: name.trim() || "Espacio de trabajo", logo: null },
			]}
			activeSlug={slug}
			onSwitch={() => {
				nav.close();
				router.push(workspaceUrl());
			}}
			label="Espacio de trabajo"
			actions={WORKSPACE_ACTIONS.map((action) => (
				<DropdownMenuItem key={action.href} asChild onSelect={nav.close}>
					<Link href={workspaceUrl(action.href)}>
						<action.icon aria-hidden />
						{action.title}
					</Link>
				</DropdownMenuItem>
			))}
		/>
	);
}

export function WorkspaceNav({
	initialWorkspace,
}: {
	initialWorkspace?: WorkspaceData;
}) {
	const pathname = usePathname();
	const workspaceUrl = useWorkspaceUrl();
	const prefetchSection = usePrefetchSection();

	const resolve = (item: NavItem): NavItem => ({
		...item,
		href: workspaceUrl(item.href),
		related: item.related?.map((path) => workspaceUrl(path)),
	});

	const settings = resolve(SETTINGS);

	if (startsWithSegment(pathname, settings.href)) {
		return (
			<AppSidebar
				label="Configuración del espacio"
				header={<WorkspaceHeader initialWorkspace={initialWorkspace} />}
			>
				<AppSidebarSection
					label="Configuración"
					back={<Link href={workspaceUrl()} transitionTypes={["nav-back"]} />}
				>
					<AppSidebarGroup>
						{SETTINGS_PAGES.map((page) => {
							const href = workspaceUrl(page.href);
							const active =
								page.href === SETTINGS.href
									? pathname === href
									: startsWithSegment(pathname, href);
							return (
								<AppSidebarItem
									key={page.href}
									label={page.title}
									active={active}
									inset
								>
									<Link
										href={href}
										prefetch
										transitionTypes={["nav-lateral"]}
									/>
								</AppSidebarItem>
							);
						})}
					</AppSidebarGroup>
				</AppSidebarSection>
			</AppSidebar>
		);
	}

	const items = PRIMARY.map(resolve);
	const chat = items.find((item) => item.href === workspaceUrl("/chat"));

	if (chat && isActive(chat, pathname)) {
		return (
			<AppSidebar
				label="Chats"
				header={<WorkspaceHeader initialWorkspace={initialWorkspace} />}
			>
				<AgentChatNav />
			</AppSidebar>
		);
	}

	const link = (item: NavItem, section: string) => (
		<AppSidebarItem
			key={item.href}
			icon={item.icon}
			label={item.title}
			active={isActive(item, pathname)}
		>
			<Link
				href={item.href}
				prefetch
				onMouseEnter={() => prefetchSection(section)}
				onFocus={() => prefetchSection(section)}
				transitionTypes={["nav-lateral"]}
			/>
		</AppSidebarItem>
	);

	return (
		<AppSidebar
			label="Principal"
			header={<WorkspaceHeader initialWorkspace={initialWorkspace} />}
			footer={link(settings, SETTINGS.href)}
		>
			<AppSidebarGroup>
				{items.map((item, index) => link(item, PRIMARY[index]?.href ?? "/"))}
			</AppSidebarGroup>
		</AppSidebar>
	);
}

export function WorkspaceNavFallback() {
	return (
		<AppSidebar label="Principal" header={<AppSidebarWorkspace loading />}>
			<AppSidebarSkeleton rows={PRIMARY.length} />
		</AppSidebar>
	);
}
