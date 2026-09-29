import { Navigate, Route, Routes } from "react-router-dom";

import PublicLayout from "@/layouts/PublicLayout";
import RoleLayout from "@/layouts/RoleLayout";
import { RequireRole } from "@/features/auth/RequireRole";

import Index from "./Index";
import About from "./About";
import Contact from "./Contact";
import NotFound from "./NotFound";
import WorkflowDemoPage from "./WorkflowDemoPage";

import LoginPage from "@/features/auth/LoginPage";
import ProductsPage from "@/features/catalogue/pages/ProductsPage";
import ProductDetailPage from "@/features/catalogue/pages/ProductDetailPage";

import HqDashboard from "@/features/hq/pages/HqDashboard";
import RuleBookPage from "@/features/hq/pages/RuleBookPage";
import { HqFinancePage, HqPeoplePage } from "@/features/hq/pages/HqReportsPages";

import AdminDashboard from "@/features/admin/pages/AdminDashboard";
import ProjectsListPage from "@/features/admin/pages/ProjectsListPage";
import ProjectDetailPage from "@/features/admin/pages/ProjectDetailPage";
import NewProjectPage from "@/features/admin/pages/NewProjectPage";
import DispatchBoardPage from "@/features/admin/pages/DispatchBoardPage";
import TicketsQueuePage from "@/features/admin/pages/TicketsQueuePage";
import OperationsToolsPage from "@/features/admin/pages/OperationsToolsPage";
import ProcurementPage from "@/features/admin/pages/ProcurementPage";
import FranchiseesPage from "@/features/admin/pages/FranchiseesPage";
import LogisticsSettingsPage from "@/features/admin/pages/LogisticsSettingsPage";
import { CataloguePage, ClientsPage, KitsPage, VendorsPage, UsersPage } from "@/features/admin/pages/MastersPages";

import MySitesPage from "@/features/site/pages/MySitesPage";
import SiteProjectPage from "@/features/site/pages/SiteProjectPage";
import MyReportsPage from "@/features/site/pages/MyReportsPage";

import {
  ChallansPage, EwayPage, InvoicesPage, PaymentsPage, RetentionPage,
} from "@/features/accounts/pages/FinancePages";
import AccountsControlsPage from "@/features/accounts/pages/AccountsControlsPage";
import CostCentresPage from "@/features/accounts/pages/CostCentresPage";
import AccountsHomePage from "@/features/accounts/pages/AccountsHomePage";

import MyShowroomsPage from "@/features/portal/pages/MyShowroomsPage";
import PortalProjectPage from "@/features/portal/pages/PortalProjectPage";
import ApprovalsPage from "@/features/portal/pages/ApprovalsPage";
import NewShowroomRequestPage from "@/features/portal/pages/NewShowroomRequestPage";
import RoleGuidePage from "@/features/help/RoleGuidePage";
import VendorWorkPage from "@/features/vendor/pages/VendorWorkPage";
import ProjectJourneyPage from "@/features/shared/ProjectJourneyPage";

export default function AppRouter() {
  return (
    <Routes>
      {/* ---------------------------------------------------------- public */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Index />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:slug" element={<ProductDetailPage />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/walkthrough" element={<WorkflowDemoPage />} />
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* ----------------------------------------------------- super admin */}
      <Route
        path="/hq"
        element={<RequireRole allow={["SUPER_ADMIN"]}><RoleLayout /></RequireRole>}
      >
        <Route index element={<HqDashboard />} />
        <Route path="projects" element={<ProjectsListPage />} />
        <Route path="projects/:projectId" element={<ProjectJourneyPage home="/hq/projects" classic="/hq/projects" />} />
        <Route path="finance" element={<HqFinancePage />} />
        <Route path="people" element={<HqPeoplePage />} />
        <Route path="rules" element={<RuleBookPage />} />
        <Route path="how-to-use" element={<RoleGuidePage />} />
      </Route>

      {/* ----------------------------------------------------------- admin */}
      <Route
        path="/admin"
        element={<RequireRole allow={["ADMIN"]}><RoleLayout /></RequireRole>}
      >
        <Route index element={<AdminDashboard />} />
        <Route path="projects" element={<ProjectsListPage />} />
        <Route path="projects/new" element={<NewProjectPage />} />
        <Route path="projects/:projectId" element={<ProjectJourneyPage home="/admin/projects" classic="/admin/projects/:projectId/records" />} />
        <Route path="projects/:projectId/records" element={<ProjectDetailPage />} />
        <Route path="dispatch" element={<DispatchBoardPage />} />
        <Route path="logistics" element={<LogisticsSettingsPage />} />
        <Route path="tickets" element={<TicketsQueuePage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="catalogue" element={<CataloguePage />} />
        <Route path="cost-centres" element={<CostCentresPage />} />
        <Route path="kits" element={<KitsPage />} />
        <Route path="vendors" element={<VendorsPage />} />
        <Route path="franchisees" element={<FranchiseesPage />} />
        <Route path="procurement" element={<ProcurementPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="tools" element={<OperationsToolsPage />} />
        <Route path="how-to-use" element={<RoleGuidePage />} />
      </Route>

      {/* ---------------------------------------------------- installation */}
      <Route
        path="/site"
        element={<RequireRole allow={["INSTALLATION"]}><RoleLayout /></RequireRole>}
      >
        <Route index element={<MySitesPage />} />
        <Route path="tickets" element={<MyReportsPage />} />
        <Route path=":projectId" element={<SiteProjectPage />} />
        <Route path="how-to-use" element={<RoleGuidePage />} />
      </Route>

      {/* -------------------------------------------------------- accounts */}
      <Route
        path="/accounts"
        element={<RequireRole allow={["ACCOUNTS"]}><RoleLayout /></RequireRole>}
      >
        <Route index element={<AccountsHomePage />} />
        <Route path="challans" element={<ChallansPage />} />
        <Route path="eway" element={<EwayPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="retention" element={<RetentionPage />} />
        <Route path="controls" element={<AccountsControlsPage />} />
        <Route path="cost-centres" element={<CostCentresPage />} />
        <Route path="how-to-use" element={<RoleGuidePage />} />
      </Route>

      {/* ---------------------------------------------------------- client */}
      <Route
        path="/portal"
        element={<RequireRole allow={["CLIENT"]}><RoleLayout /></RequireRole>}
      >
        <Route index element={<MyShowroomsPage />} />
        <Route path="showrooms/new" element={<NewShowroomRequestPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="projects/:projectId" element={<ProjectJourneyPage home="/portal" classic="/portal/projects/:projectId/records" />} />
        <Route path="projects/:projectId/records" element={<PortalProjectPage />} />
        <Route path="how-to-use" element={<RoleGuidePage />} />
      </Route>

      <Route path="/franchisee" element={<RequireRole allow={["VENDOR"]}><RoleLayout /></RequireRole>}>
        <Route index element={<VendorWorkPage />} />
        <Route path="how-to-use" element={<RoleGuidePage />} />
      </Route>
      <Route path="/vendor/*" element={<Navigate to="/franchisee" replace />} />

      <Route path="/app" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
