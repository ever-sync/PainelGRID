import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import clsx from "clsx";
import {
  Car,
  Database,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
  Upload,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { ConfirmationModal } from "../../components/ui/ConfirmationModal";
import { Badge } from "../../components/ui/Badge";
import { MissingClientScope } from "../../components/shared/MissingClientScope";
import type { User } from "../../types";
import { resolveClientId } from "../../utils/userContext";
import { readStoredSession } from "../../services/auth";
import {
  listClientVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  listCarBrands,
  listCarModelsByBrand,
  importVehicleCatalog,
  syncVehicleCatalog,
  type Vehicle,
  type VehicleCatalogItem,
  type VehicleOption,
} from "../../services/vehicles";
import {
  DASHBOARD_DARK_CHANGE_EVENT,
  readDashboardDarkEnabled,
} from "../../lib/dashboard-dark-mode";
import { resizeImageToDataUrl } from "../../utils/image";

type OutletContext = {
  user: User;
};

const CAR_CATEGORIES = [
  "Hatch",
  "Sedan",
  "SUV",
  "Picape",
  "Minivan",
  "Esportivo",
  "Conversível",
  "Van / Utilitário",
];

export function VeiculosPage() {
  const { user } = useOutletContext<OutletContext>();
  const clientId = resolveClientId(user);
  const [isDarkMode, setIsDarkMode] = useState(() =>
    readDashboardDarkEnabled(user.id),
  );

  // States for vehicles showcase
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [vehiclesSearch, setVehiclesSearch] = useState("");
  const [vehiclesStatusFilter, setVehiclesStatusFilter] = useState<
    "all" | "available" | "hidden"
  >("all");
  const [vehiclesTagFilter, setVehiclesTagFilter] = useState("all");

  // Form/Modal states for vehicles
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [, setVehicleYearOrKm] = useState("");
  const [vehiclePrice, setVehiclePrice] = useState("");
  const [vehicleStores, setVehicleStores] = useState("");
  const [vehicleStatus, setVehicleStatus] = useState(true);
  const [vehicleTags, setVehicleTags] = useState<string[]>([]);
  const [newVehicleTagInput, setNewVehicleTagInput] = useState("");
  const [vehicleImageUrl, setVehicleImageUrl] = useState("");
  const [vehicleCategory, setVehicleCategory] = useState("");
  const [vehicleGallery, setVehicleGallery] = useState<string[]>([]);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);

  // Upload/Resizing states
  const [isResizingImages, setIsResizingImages] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [vehicleCondition, setVehicleCondition] = useState<"novo" | "seminovo">(
    "novo",
  );
  const [vehicleManufacturingYear, setVehicleManufacturingYear] = useState("");
  const [vehicleModelYear, setVehicleModelYear] = useState("");
  const [vehicleKm, setVehicleKm] = useState("");

  // Máscaras de Entrada e Helpers de Parsing
  const formatBRL = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    const num = parseFloat(digits) / 100;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(num);
  };

  const parseBRLToDecimal = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (!digits) return "0.00";
    return (parseFloat(digits) / 100).toFixed(2);
  };

  const formatKM = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "";
    return new Intl.NumberFormat("pt-BR").format(parseInt(digits, 10));
  };

  const parseKMToInt = (val: string) => {
    const digits = val.replace(/\D/g, "");
    return digits || "0";
  };

  const handleYearChange = (val: string, setter: (v: string) => void) => {
    const digits = val.replace(/\D/g, "").slice(0, 4);
    setter(digits);
  };

  // FIPE Integration states
  const [fipeBrands, setFipeBrands] = useState<VehicleOption[]>([]);
  const [selectedBrandCode, setSelectedBrandCode] = useState("");
  const [fipeModels, setFipeModels] = useState<VehicleOption[]>([]);
  const [loadingFipeBrands, setLoadingFipeBrands] = useState(false);
  const [loadingFipeModels, setLoadingFipeModels] = useState(false);
  const [isManualInput, setIsManualInput] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogImporting, setCatalogImporting] = useState(false);
  const [catalogBrand, setCatalogBrand] = useState("");
  const [catalogItems, setCatalogItems] = useState<VehicleCatalogItem[]>([]);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const [catalogMessage, setCatalogMessage] = useState("");

  // Sync Dark Mode
  useEffect(() => {
    setIsDarkMode(readDashboardDarkEnabled(user.id));
  }, [user.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsDarkMode(readDashboardDarkEnabled(user.id));
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener(DASHBOARD_DARK_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener(DASHBOARD_DARK_CHANGE_EVENT, sync);
    };
  }, [user.id]);

  // Load vehicles
  const loadVehicles = useCallback(() => {
    if (!clientId) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    setVehiclesLoading(true);
    listClientVehicles(clientId, {}, session.accessToken)
      .then((data) => setVehicles(data))
      .catch((err) => {
        console.error("Erro ao carregar veículos:", err);
      })
      .finally(() => setVehiclesLoading(false));
  }, [clientId]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  // Load FIPE brands when modal opens
  useEffect(() => {
    if (!isVehicleModalOpen) return;
    setLoadingFipeBrands(true);
    listCarBrands()
      .then((data) => {
        setFipeBrands(data);
        if (editingVehicleId) {
          const matchedBrand = data.find(
            (b) => b.label.toLowerCase() === vehicleBrand.toLowerCase(),
          );
          if (matchedBrand) {
            setSelectedBrandCode(matchedBrand.value);
            setIsManualInput(false);
          } else {
            setSelectedBrandCode("");
            setIsManualInput(true);
          }
        } else {
          setIsManualInput(false);
        }
      })
      .catch((err) => console.error("Erro FIPE marcas:", err))
      .finally(() => setLoadingFipeBrands(false));
  }, [isVehicleModalOpen, editingVehicleId]);

  // Load FIPE models when brand changes
  useEffect(() => {
    if (!selectedBrandCode) {
      setFipeModels([]);
      return;
    }
    setLoadingFipeModels(true);
    listCarModelsByBrand(selectedBrandCode)
      .then((data) => setFipeModels(data))
      .catch((err) => console.error("Erro FIPE modelos:", err))
      .finally(() => setLoadingFipeModels(false));
  }, [selectedBrandCode]);

  const handleMainImageChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadError("Use uma imagem válida (PNG, JPG, WEBP, GIF, SVG).");
      return;
    }

    const MAX_INPUT_BYTES = 10_000_000;
    if (file.size > MAX_INPUT_BYTES) {
      setUploadError(
        `Imagem muito grande (${Math.round(file.size / 1024)}KB). Máximo 10MB.`,
      );
      return;
    }

    setUploadError("");
    setIsResizingImages(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, {
        maxDimension: 800,
        quality: 0.8,
      });
      setVehicleImageUrl(dataUrl);
    } catch (err) {
      console.error(err);
      setUploadError("Não foi possível processar a imagem.");
    } finally {
      setIsResizingImages(false);
    }
  };

  const handleGalleryImagesChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadError("");
    setIsResizingImages(true);
    try {
      const newUrls: string[] = [];
      const MAX_INPUT_BYTES = 10_000_000;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        if (file.size > MAX_INPUT_BYTES) continue;

        const dataUrl = await resizeImageToDataUrl(file, {
          maxDimension: 800,
          quality: 0.8,
        });
        newUrls.push(dataUrl);
      }

      setVehicleGallery((prev) => [...prev, ...newUrls]);
    } catch (err) {
      console.error(err);
      setUploadError("Erro ao processar imagens da galeria.");
    } finally {
      setIsResizingImages(false);
    }
  };

  const removeGalleryImage = (indexToRemove: number) => {
    setVehicleGallery((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSaveVehicle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const session = readStoredSession();
    if (!session?.accessToken || !clientId) return;

    if (
      !vehicleBrand.trim() ||
      !vehicleModel.trim() ||
      !vehiclePrice.trim() ||
      !vehicleStores.trim()
    ) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    const parsedPrice = parseBRLToDecimal(vehiclePrice);
    const parsedKm =
      vehicleCondition === "novo" ? "0" : parseKMToInt(vehicleKm);

    // Dynamic year_or_km combined legacy field
    const kmStr =
      vehicleCondition === "novo" ? "0 km" : `${formatKM(parsedKm)} km`;
    const yearStr =
      vehicleManufacturingYear && vehicleModelYear
        ? `${vehicleManufacturingYear}/${vehicleModelYear}`
        : vehicleModelYear || vehicleManufacturingYear || "n/d";
    const yearOrKmCombined = `${yearStr} - ${kmStr}`;

    const payload = {
      client_id: clientId,
      brand: vehicleBrand,
      model: vehicleModel,
      year_or_km: yearOrKmCombined,
      price: parsedPrice,
      stores: vehicleStores,
      status: vehicleStatus,
      tags: vehicleTags,
      image_url: vehicleImageUrl.trim() || undefined,
      category: vehicleCategory || undefined,
      gallery: vehicleGallery,
      condition: vehicleCondition,
      manufacturing_year: vehicleManufacturingYear || undefined,
      model_year: vehicleModelYear || undefined,
      km: parsedKm,
    };

    try {
      if (editingVehicleId) {
        await updateVehicle(editingVehicleId, payload, session.accessToken);
      } else {
        await createVehicle(payload, session.accessToken);
      }
      setIsVehicleModalOpen(false);
      loadVehicles();
      // Reset form
      setEditingVehicleId(null);
      setVehicleBrand("");
      setVehicleModel("");
      setVehicleYearOrKm("");
      setVehiclePrice("");
      setVehicleStores("");
      setVehicleStatus(true);
      setVehicleTags([]);
      setSelectedBrandCode("");
      setVehicleImageUrl("");
      setVehicleCategory("");
      setVehicleGallery([]);
      setUploadError("");
      setVehicleCondition("novo");
      setVehicleManufacturingYear("");
      setVehicleModelYear("");
      setVehicleKm("");
    } catch (err) {
      console.error("Erro ao salvar veículo:", err);
      alert("Erro ao salvar veículo.");
    }
  };

  const handleToggleVehicleStatus = async (vehicle: Vehicle) => {
    const session = readStoredSession();
    if (!session?.accessToken) return;

    try {
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === vehicle.id ? { ...v, status: !v.status } : v,
        ),
      );
      await updateVehicle(
        vehicle.id,
        { status: !vehicle.status },
        session.accessToken,
      );
    } catch (err) {
      console.error("Erro ao alternar status do veículo:", err);
      loadVehicles();
    }
  };

  const handleDeleteVehicleConfirm = async () => {
    if (!vehicleToDelete) return;
    const session = readStoredSession();
    if (!session?.accessToken) return;

    try {
      await deleteVehicle(vehicleToDelete.id, session.accessToken);
      setVehicleToDelete(null);
      loadVehicles();
    } catch (err) {
      console.error("Erro ao excluir veículo:", err);
      alert("Erro ao excluir veículo.");
    }
  };

  const openEditVehicleModal = (vehicle: Vehicle) => {
    setEditingVehicleId(vehicle.id);
    setVehicleBrand(vehicle.brand);
    setVehicleModel(vehicle.model);
    setVehicleYearOrKm(vehicle.year_or_km);

    if (vehicle.price) {
      const centsStr = (parseFloat(vehicle.price) * 100).toFixed(0);
      setVehiclePrice(formatBRL(centsStr));
    } else {
      setVehiclePrice("");
    }

    setVehicleStores(vehicle.stores);
    setVehicleStatus(vehicle.status);
    setVehicleTags(vehicle.tags || []);
    setVehicleImageUrl(vehicle.image_url || "");
    setVehicleCategory(vehicle.category || "");
    setVehicleGallery(vehicle.gallery || []);
    setUploadError("");

    const initialCondition =
      (vehicle.condition as "novo" | "seminovo") ||
      (vehicle.year_or_km?.toLowerCase().includes("novo")
        ? "novo"
        : "seminovo");
    setVehicleCondition(initialCondition);
    setVehicleManufacturingYear(vehicle.manufacturing_year || "");
    setVehicleModelYear(vehicle.model_year || "");
    setVehicleKm(
      vehicle.km
        ? formatKM(vehicle.km)
        : initialCondition === "novo"
          ? "0"
          : "",
    );

    const matchedBrand = fipeBrands.find(
      (b) => b.label.toLowerCase() === vehicle.brand.toLowerCase(),
    );
    if (matchedBrand) {
      setSelectedBrandCode(matchedBrand.value);
      setIsManualInput(false);
    } else {
      setSelectedBrandCode("");
      setIsManualInput(true);
    }
    setIsVehicleModalOpen(true);
  };

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const matchesSearch =
        v.brand.toLowerCase().includes(vehiclesSearch.toLowerCase()) ||
        v.model.toLowerCase().includes(vehiclesSearch.toLowerCase());

      const matchesStatus =
        vehiclesStatusFilter === "all"
          ? true
          : vehiclesStatusFilter === "available"
            ? v.status === true
            : v.status === false;

      const matchesTag =
        vehiclesTagFilter === "all" ? true : v.tags.includes(vehiclesTagFilter);

      return matchesSearch && matchesStatus && matchesTag;
    });
  }, [vehicles, vehiclesSearch, vehiclesStatusFilter, vehiclesTagFilter]);

  const allVehicleTags = useMemo(() => {
    const tagsSet = new Set<string>();
    vehicles.forEach((v) => {
      if (v.tags) v.tags.forEach((t) => tagsSet.add(t));
    });
    return Array.from(tagsSet);
  }, [vehicles]);

  const handleAddTagToVehicleForm = () => {
    if (!newVehicleTagInput.trim()) return;
    const cleanTag = newVehicleTagInput.trim().toLowerCase();
    if (!vehicleTags.includes(cleanTag)) {
      setVehicleTags((prev) => [...prev, cleanTag]);
    }
    setNewVehicleTagInput("");
  };

  const handleRemoveTagFromVehicleForm = (tagToRemove: string) => {
    setVehicleTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleOpenCatalog = async () => {
    const token = readStoredSession()?.accessToken;
    if (!token || !clientId) return;
    setCatalogOpen(true);
    setCatalogLoading(true);
    setCatalogMessage("");
    try {
      const response = await syncVehicleCatalog(clientId, token);
      setCatalogBrand(response.brand);
      setCatalogItems(response.items);
      setSelectedCatalogIds(
        response.items.filter((item) => !item.imported).map((item) => item.id),
      );
    } catch (error) {
      setCatalogMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível sincronizar o catálogo FIPE.",
      );
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleImportCatalog = async () => {
    const token = readStoredSession()?.accessToken;
    if (!token || !clientId || !selectedCatalogIds.length) return;
    setCatalogImporting(true);
    setCatalogMessage("");
    try {
      const result = await importVehicleCatalog(
        clientId,
        selectedCatalogIds,
        token,
      );
      setCatalogMessage(
        `${result.imported} modelo${result.imported === 1 ? "" : "s"} importado${result.imported === 1 ? "" : "s"}.`,
      );
      setCatalogItems((items) =>
        items.map((item) =>
          selectedCatalogIds.includes(item.id)
            ? { ...item, imported: true }
            : item,
        ),
      );
      setSelectedCatalogIds([]);
      loadVehicles();
    } catch (error) {
      setCatalogMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível importar os modelos.",
      );
    } finally {
      setCatalogImporting(false);
    }
  };

  if (!clientId) return <MissingClientScope />;

  return (
    <div
      className={clsx(
        isDarkMode &&
          "dashboard-dark cliente-detail-dark -mx-4 -mt-4 rounded-none px-4 pb-8 pt-4 md:-mx-6 md:-mt-6 md:px-6 xl:-mx-8 xl:-mt-8 xl:px-8 bg-black",
      )}
    >
      <PageHeader
        title="Veículos"
        breadcrumbs={[{ label: "TechStore" }, { label: "Veículos" }]}
        dark={isDarkMode}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => void handleOpenCatalog()}
              icon={<Database size={16} />}
            >
              Importar da FIPE
            </Button>
            <Button
              onClick={() => {
                setEditingVehicleId(null);
                setVehicleBrand("");
                setVehicleModel("");
                setVehicleYearOrKm("");
                setVehiclePrice("");
                setVehicleStores("");
                setVehicleStatus(true);
                setVehicleTags([]);
                setSelectedBrandCode("");
                setIsManualInput(false);
                setVehicleImageUrl("");
                setVehicleCategory("");
                setVehicleGallery([]);
                setUploadError("");
                setVehicleCondition("novo");
                setVehicleManufacturingYear("");
                setVehicleModelYear("");
                setVehicleKm("");
                setIsVehicleModalOpen(true);
              }}
              className="bg-[#E51838] text-white hover:bg-[#c01530] transition-colors"
              icon={<Plus size={16} />}
            >
              Novo Veículo
            </Button>
          </div>
        }
      />

      <Card padding="none" className={clsx(isDarkMode && "card-surface")}>
        <div
          className={clsx(
            "space-y-4 border-b p-4",
            isDarkMode ? "border-zinc-800" : "border-gray-100",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3
                className={clsx(
                  "text-base font-semibold",
                  isDarkMode ? "text-zinc-100" : "text-gray-900",
                )}
              >
                Vitrine de Veículos
              </h3>
              <p
                className={clsx(
                  "mt-1 text-xs",
                  isDarkMode ? "text-zinc-400" : "text-gray-400",
                )}
              >
                {vehiclesLoading
                  ? "Carregando veículos..."
                  : filteredVehicles.length === 1
                    ? "1 veículo encontrado"
                    : `${filteredVehicles.length} veículos encontrados`}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_180px_180px]">
            <label className="relative">
              <Search
                size={15}
                className={clsx(
                  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2",
                  isDarkMode ? "text-zinc-500" : "text-gray-400",
                )}
              />
              <input
                value={vehiclesSearch}
                onChange={(e) => setVehiclesSearch(e.target.value)}
                placeholder="Buscar por marca ou modelo..."
                className={clsx(
                  "h-10 w-full rounded-xl border pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-red-100 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100 placeholder-zinc-500"
                    : "border-gray-200 bg-white text-gray-700 placeholder-gray-400",
                )}
              />
            </label>

            <select
              value={vehiclesStatusFilter}
              onChange={(e) => {
                const value = e.target.value;
                if (
                  value === "all" ||
                  value === "available" ||
                  value === "hidden"
                ) {
                  setVehiclesStatusFilter(value);
                }
              }}
              className={clsx(
                "h-10 rounded-xl border px-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-red-100 focus:border-[#E51838]",
                isDarkMode
                  ? "border-zinc-800 bg-[#0c0d11] text-zinc-350"
                  : "border-gray-200 bg-white text-gray-600",
              )}
            >
              <option value="all">Todos os Status</option>
              <option value="available">Disponíveis</option>
              <option value="hidden">Ocultos</option>
            </select>

            <select
              value={vehiclesTagFilter}
              onChange={(e) => setVehiclesTagFilter(e.target.value)}
              className={clsx(
                "h-10 rounded-xl border px-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-red-100 focus:border-[#E51838]",
                isDarkMode
                  ? "border-zinc-800 bg-[#0c0d11] text-zinc-350"
                  : "border-gray-200 bg-white text-gray-600",
              )}
            >
              <option value="all">Todas as Tags</option>
              {allVehicleTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        </div>

        {vehiclesLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">
            Carregando veículos...
          </div>
        ) : filteredVehicles.length === 0 ? (
          <div className="py-16 text-center">
            <Car
              size={40}
              className={clsx(
                "mx-auto mb-3",
                isDarkMode ? "text-zinc-700" : "text-gray-300",
              )}
            />
            <p
              className={clsx(
                "text-sm font-medium",
                isDarkMode ? "text-zinc-300" : "text-gray-500",
              )}
            >
              Nenhum veículo encontrado
            </p>
            <p
              className={clsx(
                "mt-1 text-xs",
                isDarkMode ? "text-zinc-500" : "text-gray-400",
              )}
            >
              {vehiclesSearch ||
              vehiclesStatusFilter !== "all" ||
              vehiclesTagFilter !== "all"
                ? "Tente ajustar os seus filtros de busca."
                : "Cadastre o primeiro veículo para a sua vitrine."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className={clsx(
                    "border-b text-left text-xs font-medium",
                    isDarkMode
                      ? "border-zinc-800 bg-zinc-900/30 text-zinc-400"
                      : "border-gray-100 bg-gray-50 text-gray-500",
                  )}
                >
                  <th className="px-4 py-3">Marca</th>
                  <th className="px-4 py-3">Modelo</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Ano</th>
                  <th className="px-4 py-3">KM</th>
                  <th className="px-4 py-3">Condição</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Lojas</th>
                  <th className="px-4 py-3">Tags</th>
                  <th className="px-4 py-3">Disponível</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody
                className={clsx(
                  "divide-y",
                  isDarkMode ? "divide-zinc-800" : "divide-gray-50",
                )}
              >
                {filteredVehicles.map((vehicle) => (
                  <tr
                    key={vehicle.id}
                    className={clsx(
                      "transition-colors",
                      isDarkMode
                        ? "hover:bg-zinc-900/20"
                        : "hover:bg-gray-50/60",
                    )}
                  >
                    <td
                      className={clsx(
                        "px-4 py-3 font-semibold",
                        isDarkMode ? "text-zinc-200" : "text-gray-900",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {vehicle.image_url ? (
                          <img
                            src={vehicle.image_url}
                            alt={`${vehicle.brand} ${vehicle.model}`}
                            className="h-10 w-14 rounded-lg object-cover bg-gray-100 dark:bg-zinc-800 border dark:border-zinc-700 shadow-sm shrink-0"
                          />
                        ) : (
                          <div
                            className={clsx(
                              "flex h-10 w-14 items-center justify-center rounded-lg border shadow-sm shrink-0",
                              isDarkMode
                                ? "bg-zinc-800 border-zinc-700 text-zinc-400"
                                : "bg-gray-50 border-gray-100 text-gray-400",
                            )}
                          >
                            <Car size={16} />
                          </div>
                        )}
                        <span>{vehicle.brand}</span>
                      </div>
                    </td>
                    <td
                      className={clsx(
                        "px-4 py-3 font-medium",
                        isDarkMode ? "text-zinc-300" : "text-gray-700",
                      )}
                    >
                      {vehicle.model}
                    </td>
                    <td
                      className={clsx(
                        "px-4 py-3 font-medium",
                        isDarkMode ? "text-zinc-350" : "text-gray-600",
                      )}
                    >
                      {vehicle.category || (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td
                      className={clsx(
                        "px-4 py-3",
                        isDarkMode ? "text-zinc-400" : "text-gray-600",
                      )}
                    >
                      {vehicle.manufacturing_year && vehicle.model_year
                        ? `${vehicle.manufacturing_year}/${vehicle.model_year}`
                        : vehicle.model_year ||
                          vehicle.manufacturing_year ||
                          vehicle.year_or_km?.split("-")[0]?.trim() ||
                          "-"}
                    </td>
                    <td
                      className={clsx(
                        "px-4 py-3",
                        isDarkMode ? "text-zinc-400" : "text-gray-600",
                      )}
                    >
                      {vehicle.condition === "novo"
                        ? "0 km"
                        : vehicle.km
                          ? `${formatKM(vehicle.km)} km`
                          : vehicle.year_or_km?.includes("km")
                            ? vehicle.year_or_km.split("-")[1]?.trim() ||
                              vehicle.year_or_km
                            : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {vehicle.condition === "novo" ? (
                        <Badge variant="green">Novo</Badge>
                      ) : vehicle.condition === "seminovo" ? (
                        <Badge variant="gray">Seminovo</Badge>
                      ) : vehicle.year_or_km?.toLowerCase().includes("novo") ? (
                        <Badge variant="green">Novo</Badge>
                      ) : (
                        <span className="text-zinc-500 dark:text-zinc-400 text-xs">
                          -
                        </span>
                      )}
                    </td>
                    <td
                      className={clsx(
                        "px-4 py-3 font-medium text-emerald-600",
                        isDarkMode && "text-emerald-400",
                      )}
                    >
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(parseFloat(vehicle.price) || 0)}
                    </td>
                    <td
                      className={clsx(
                        "px-4 py-3",
                        isDarkMode ? "text-zinc-400" : "text-gray-600",
                      )}
                    >
                      {vehicle.stores}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {vehicle.tags &&
                          vehicle.tags.map((tag) => (
                            <span
                              key={tag}
                              className={clsx(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition",
                                isDarkMode
                                  ? "bg-zinc-850 text-zinc-300"
                                  : "bg-gray-100 text-gray-600",
                              )}
                            >
                              <Tag size={8} />
                              {tag}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void handleToggleVehicleStatus(vehicle)}
                        className={clsx(
                          "relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                          vehicle.status
                            ? "bg-[#E51838]"
                            : isDarkMode
                              ? "bg-zinc-700"
                              : "bg-gray-200",
                        )}
                      >
                        <span
                          className={clsx(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            vehicle.status ? "translate-x-4" : "translate-x-0",
                          )}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          title="Editar veículo"
                          onClick={() => openEditVehicleModal(vehicle)}
                          className={clsx(
                            "rounded-lg p-1.5 transition-colors",
                            isDarkMode
                              ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                              : "text-gray-500 hover:bg-gray-100 hover:text-gray-700",
                          )}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          title="Excluir veículo"
                          onClick={() => setVehicleToDelete(vehicle)}
                          className={clsx(
                            "rounded-lg p-1.5 transition-colors",
                            isDarkMode
                              ? "text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
                              : "text-gray-500 hover:bg-red-50 hover:text-[#E51838]",
                          )}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal - Cadastro/Edição de Veículo */}
      <Modal
        open={isVehicleModalOpen}
        onClose={() => setIsVehicleModalOpen(false)}
        title={editingVehicleId ? "Editar Veículo" : "Cadastrar Veículo"}
        size="lg"
        dark={isDarkMode}
        footer={
          <>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setIsVehicleModalOpen(false)}
              isDisabled={isResizingImages}
            >
              Cancelar
            </Button>
            <Button
              size="lg"
              onClick={() => void handleSaveVehicle()}
              isDisabled={isResizingImages}
            >
              {editingVehicleId ? "Salvar Alterações" : "Salvar Veículo"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Informações de processamento ou erro */}
          {isResizingImages && (
            <div className="text-xs text-blue-500 animate-pulse font-semibold">
              🔄 Processando e compactando imagens...
            </div>
          )}
          {uploadError && (
            <div className="text-xs text-[#E51838] font-bold">
              ⚠️ {uploadError}
            </div>
          )}

          <div className="flex justify-between items-center">
            <span
              className={clsx(
                "text-xs font-semibold uppercase tracking-wider",
                isDarkMode ? "text-zinc-400" : "text-zinc-500",
              )}
            >
              FIPE API & Inserção Manual
            </span>
            <button
              type="button"
              onClick={() => {
                setIsManualInput(!isManualInput);
                setSelectedBrandCode("");
                setVehicleBrand("");
                setVehicleModel("");
              }}
              className="text-xs font-semibold text-[#E51838] hover:underline"
            >
              {isManualInput ? "✨ Usar Busca FIPE" : "✏️ Digitar Manualmente"}
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Marca */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Marca *
              </label>
              {isManualInput ? (
                <input
                  type="text"
                  value={vehicleBrand}
                  onChange={(e) => setVehicleBrand(e.target.value)}
                  placeholder="Ex: Toyota"
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                      : "border-gray-200 bg-white text-gray-700",
                  )}
                />
              ) : (
                <select
                  value={selectedBrandCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setSelectedBrandCode(code);
                    const brand = fipeBrands.find((b) => b.value === code);
                    if (brand) {
                      setVehicleBrand(brand.label);
                    } else {
                      setVehicleBrand("");
                    }
                    setVehicleModel("");
                  }}
                  disabled={loadingFipeBrands}
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                      : "border-gray-200 bg-white text-gray-700",
                  )}
                >
                  <option value="">
                    {loadingFipeBrands
                      ? "Carregando marcas..."
                      : "Selecione uma marca..."}
                  </option>
                  {fipeBrands.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Modelo */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Modelo *
              </label>
              {isManualInput ? (
                <input
                  type="text"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  placeholder="Ex: Corolla XEI 2.0"
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                      : "border-gray-200 bg-white text-gray-700",
                  )}
                />
              ) : (
                <select
                  value={
                    fipeModels.some((m) => m.label === vehicleModel)
                      ? vehicleModel
                      : ""
                  }
                  onChange={(e) => setVehicleModel(e.target.value)}
                  disabled={!selectedBrandCode || loadingFipeModels}
                  className={clsx(
                    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                      : "border-gray-200 bg-white text-gray-700",
                  )}
                >
                  <option value="">
                    {!selectedBrandCode
                      ? "Selecione uma marca primeiro"
                      : loadingFipeModels
                        ? "Carregando modelos..."
                        : "Selecione um modelo..."}
                  </option>
                  {fipeModels.map((m) => (
                    <option key={m.value} value={m.label}>
                      {m.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Condição */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Condição *
              </label>
              <select
                value={vehicleCondition}
                onChange={(e) => {
                  const cond = e.target.value as "novo" | "seminovo";
                  setVehicleCondition(cond);
                  if (cond === "novo") {
                    setVehicleKm("0");
                  } else {
                    setVehicleKm("");
                  }
                }}
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                    : "border-gray-200 bg-white text-gray-700",
                )}
              >
                <option value="novo">Novo</option>
                <option value="seminovo">Seminovo</option>
              </select>
            </div>

            {/* KM */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                KM *
              </label>
              <input
                type="text"
                disabled={vehicleCondition === "novo"}
                value={vehicleCondition === "novo" ? "0" : vehicleKm}
                onChange={(e) => setVehicleKm(formatKM(e.target.value))}
                placeholder={vehicleCondition === "novo" ? "0" : "Ex: 45.000"}
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100 disabled:bg-zinc-900/60 disabled:text-zinc-500"
                    : "border-gray-200 bg-white text-gray-700 disabled:bg-gray-100 disabled:text-gray-400",
                )}
              />
            </div>

            {/* Ano de Fabricação */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Ano de Fabricação *
              </label>
              <input
                type="text"
                value={vehicleManufacturingYear}
                onChange={(e) =>
                  handleYearChange(e.target.value, setVehicleManufacturingYear)
                }
                placeholder="Ex: 2022"
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                    : "border-gray-200 bg-white text-gray-700",
                )}
              />
            </div>

            {/* Ano do Modelo */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Ano do Modelo *
              </label>
              <input
                type="text"
                value={vehicleModelYear}
                onChange={(e) =>
                  handleYearChange(e.target.value, setVehicleModelYear)
                }
                placeholder="Ex: 2023"
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                    : "border-gray-200 bg-white text-gray-700",
                )}
              />
            </div>

            {/* Valor */}
            <div className="space-y-1.5">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Preço (R$) *
              </label>
              <input
                type="text"
                value={vehiclePrice}
                onChange={(e) => setVehiclePrice(formatBRL(e.target.value))}
                placeholder="Ex: R$ 89.900,00"
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                    : "border-gray-200 bg-white text-gray-700",
                )}
              />
            </div>

            {/* Categoria */}
            <div className="space-y-1.5 sm:col-span-2">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Categoria
              </label>
              <select
                value={vehicleCategory}
                onChange={(e) => setVehicleCategory(e.target.value)}
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                    : "border-gray-200 bg-white text-gray-700",
                )}
              >
                <option value="">Selecione uma categoria...</option>
                {CAR_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Lojas */}
            <div className="space-y-1.5 sm:col-span-2">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Lojas (separadas por vírgula) *
              </label>
              <input
                type="text"
                value={vehicleStores}
                onChange={(e) => setVehicleStores(e.target.value)}
                placeholder="Ex: Matriz, Filial Centro"
                className={clsx(
                  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                  isDarkMode
                    ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                    : "border-gray-200 bg-white text-gray-700",
                )}
              />
            </div>

            {/* Foto Principal (Anexo) */}
            <div className="space-y-1.5 sm:col-span-2">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Foto Principal do Veículo *
              </label>

              {vehicleImageUrl ? (
                <div className="relative group rounded-xl border overflow-hidden max-w-xs dark:border-zinc-850 bg-zinc-900/50">
                  <img
                    src={vehicleImageUrl}
                    alt="Foto Principal"
                    className="w-full h-32 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVehicleImageUrl("")}
                      className="bg-red-650 text-white rounded-lg p-2 hover:bg-red-700 transition"
                      title="Excluir imagem"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center w-full">
                  <label
                    className={clsx(
                      "flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition hover:bg-zinc-50/50",
                      isDarkMode
                        ? "border-zinc-800 hover:bg-zinc-900/50 text-zinc-400"
                        : "border-gray-200 text-gray-400",
                    )}
                  >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="w-8 h-8 mb-2" />
                      <p className="text-xs font-medium">
                        Clique para fazer upload da foto principal
                      </p>
                      <p className="text-[10px] text-gray-550 mt-1">
                        PNG, JPG ou WEBP (Max 10MB)
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleMainImageChange}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Galeria de Fotos (Múltiplos Anexos) */}
            <div className="space-y-1.5 sm:col-span-2">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Galeria de Fotos (Múltiplos Anexos)
              </label>

              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 mb-2">
                {vehicleGallery.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-lg border overflow-hidden h-20 dark:border-zinc-850 bg-zinc-900/50"
                  >
                    <img
                      src={img}
                      alt={`Galeria ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeGalleryImage(idx)}
                      className="absolute top-1 right-1 bg-red-650/80 text-white rounded-md p-1 hover:bg-red-700 transition"
                      title="Excluir imagem"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}

                <label
                  className={clsx(
                    "flex flex-col items-center justify-center h-20 border-2 border-dashed rounded-lg cursor-pointer transition hover:bg-zinc-50/50 text-center px-1",
                    isDarkMode
                      ? "border-zinc-800 hover:bg-zinc-900/50 text-zinc-400"
                      : "border-gray-200 text-gray-400",
                  )}
                >
                  <div className="flex flex-col items-center justify-center">
                    <Plus className="w-5 h-5 mb-1" />
                    <span className="text-[10px] font-medium">Add Fotos</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleGalleryImagesChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1.5 sm:col-span-2">
              <label
                className={clsx(
                  "text-xs font-semibold",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Tags / Categorias
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newVehicleTagInput}
                  onChange={(e) => setNewVehicleTagInput(e.target.value)}
                  placeholder="Ex: SUV, Automático"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTagToVehicleForm();
                    }
                  }}
                  className={clsx(
                    "flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E51838]/30 focus:border-[#E51838]",
                    isDarkMode
                      ? "border-zinc-800 bg-[#0c0d11] text-zinc-100"
                      : "border-gray-200 bg-white text-gray-750",
                  )}
                />
                <Button
                  variant="secondary"
                  onClick={handleAddTagToVehicleForm}
                  className={clsx(
                    "border border-gray-200 hover:bg-gray-50 transition",
                    isDarkMode
                      ? "border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                      : "text-gray-600",
                  )}
                >
                  Adicionar
                </Button>
              </div>
              {vehicleTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {vehicleTags.map((tag) => (
                    <span
                      key={tag}
                      className={clsx(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition",
                        isDarkMode
                          ? "bg-zinc-800 text-zinc-200"
                          : "bg-gray-100 text-gray-700",
                      )}
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTagFromVehicleForm(tag)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Disponível switch */}
            <div className="flex items-center gap-2.5 py-1 sm:col-span-2">
              <input
                type="checkbox"
                id="vehicle-status-checkbox"
                checked={vehicleStatus}
                onChange={(e) => setVehicleStatus(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-[#E51838] focus:ring-[#E51838]/30"
              />
              <label
                htmlFor="vehicle-status-checkbox"
                className={clsx(
                  "text-xs font-semibold cursor-pointer select-none",
                  isDarkMode ? "text-zinc-300" : "text-gray-500",
                )}
              >
                Disponível para venda (Ativo na Vitrine)
              </label>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        title="Importar catálogo FIPE"
        size="xl"
      >
        <div className="space-y-4">
          <div
            className={clsx(
              "rounded-2xl border p-4",
              isDarkMode
                ? "border-zinc-800 bg-zinc-900/50"
                : "border-zinc-200 bg-zinc-50",
            )}
          >
            <p className="text-sm font-bold">
              {catalogBrand || "Marca principal do cliente"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Os modelos importados entram ocultos, com preço, ano e loja a
              definir. Revise cada veículo antes de ativá-lo na vitrine.
            </p>
          </div>

          {catalogMessage ? (
            <p
              className={clsx(
                "rounded-xl border px-3 py-2 text-sm",
                catalogMessage.includes("importado")
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                  : "border-red-500/20 bg-red-500/10 text-red-600",
              )}
            >
              {catalogMessage}
            </p>
          ) : null}

          {catalogLoading ? (
            <div className="flex items-center justify-center gap-3 py-14 text-sm text-zinc-500">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-[#E51838]" />
              Sincronizando modelos com a tabela FIPE...
            </div>
          ) : catalogItems.length ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-zinc-500">
                  {catalogItems.length} modelos encontrados ·{" "}
                  {selectedCatalogIds.length} selecionados
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const available = catalogItems
                      .filter((item) => !item.imported)
                      .map((item) => item.id);
                    setSelectedCatalogIds(
                      selectedCatalogIds.length === available.length
                        ? []
                        : available,
                    );
                  }}
                  className="text-xs font-bold text-[#E51838] hover:underline"
                >
                  {selectedCatalogIds.length ===
                  catalogItems.filter((item) => !item.imported).length
                    ? "Desmarcar todos"
                    : "Selecionar todos"}
                </button>
              </div>

              <div className="max-h-[52vh] overflow-y-auto rounded-2xl border border-border p-2">
                {catalogItems.map((item) => {
                  const checked = selectedCatalogIds.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className={clsx(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                        item.imported
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer hover:bg-muted",
                      )}
                    >
                      <input
                        type="checkbox"
                        disabled={item.imported}
                        checked={item.imported || checked}
                        onChange={() =>
                          setSelectedCatalogIds((current) =>
                            checked
                              ? current.filter((id) => id !== item.id)
                              : [...current, item.id],
                          )
                        }
                        className="h-4 w-4 rounded border-zinc-300 accent-[#E51838]"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {item.model}
                      </span>
                      {item.imported ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-500">
                          Já importado
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  variant="secondary"
                  onClick={() => setCatalogOpen(false)}
                >
                  Fechar
                </Button>
                <Button
                  loading={catalogImporting}
                  isDisabled={!selectedCatalogIds.length}
                  onClick={() => void handleImportCatalog()}
                  icon={<Upload size={16} />}
                >
                  Importar selecionados
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Modal>

      {/* Modal - Confirmação de Exclusão de Veículo */}
      <ConfirmationModal
        open={Boolean(vehicleToDelete)}
        onClose={() => setVehicleToDelete(null)}
        onConfirm={() => void handleDeleteVehicleConfirm()}
        title="Excluir Veículo"
        description={
          vehicleToDelete && (
            <p
              className={clsx(
                "text-sm",
                isDarkMode ? "text-zinc-400" : "text-zinc-600",
              )}
            >
              Tem certeza que deseja excluir o veículo{" "}
              <span
                className={clsx(
                  "font-semibold",
                  isDarkMode ? "text-zinc-100" : "text-zinc-900",
                )}
              >
                {vehicleToDelete.brand} {vehicleToDelete.model}
              </span>
              ? Esta ação removerá o veículo permanentemente e não poderá ser
              desfeita.
            </p>
          )
        }
        confirmLabel="Excluir Veículo"
      />
    </div>
  );
}
