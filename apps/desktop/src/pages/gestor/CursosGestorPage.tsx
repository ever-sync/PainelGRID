import { lazy, type ComponentType, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Play,
  BookOpen,
  Users,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "../../components/shared/PageHeader";
import { Tabs } from "../../components/ui/Tabs";
import { Card } from "../../components/ui/Card";
import { StatsCard } from "../../components/shared/StatsCard";
import { DeferredContent } from "../../components/shared/DeferredContent";
import { readStoredSession } from "../../services/auth";
import {
  getCourse,
  listCourses,
  mapApiCourseToCourse,
} from "../../services/coursesApi";
import type { Course } from "../../types";

function lazyRechart(name: keyof typeof import("recharts")) {
  return lazy(() =>
    import("recharts").then((module) => ({
      default: module[name] as ComponentType<any>,
    })),
  );
}

const BarChart = lazyRechart("BarChart");
const Bar = lazyRechart("Bar");
const XAxis = lazyRechart("XAxis");
const YAxis = lazyRechart("YAxis");
const CartesianGrid = lazyRechart("CartesianGrid");
const Tooltip = lazyRechart("Tooltip");
const ResponsiveContainer = lazyRechart("ResponsiveContainer");

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "cadastro", label: "Cadastro de Cursos" },
  { id: "alunos", label: "Alunos" },
];

export function CursosGestorPage() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [details, setDetails] = useState<Record<string, Course>>({});

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    void listCourses(token)
      .then((rows) => setCourses(rows.map(mapApiCourseToCourse)))
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!expandedCourse || !token || details[expandedCourse]) return;
    void getCourse(expandedCourse, token).then((row) => {
      setDetails((d) => ({
        ...d,
        [expandedCourse]: mapApiCourseToCourse(row),
      }));
    });
  }, [expandedCourse, details]);

  const totalCourses = courses.length;
  const activeStudents = 0;
  const completionRate = 0;
  const chartData =
    courses.length > 0
      ? courses.map((c) => ({ name: c.title, concluidos: 0, em_andamento: 0 }))
      : [{ name: "—", concluidos: 0, em_andamento: 0 }];

  return (
    <div>
      <PageHeader
        title="Cursos"
        breadcrumbs={[{ label: "Gestor" }, { label: "Cursos" }]}
      />

      <Tabs
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
        className="mb-6"
      />

      {activeTab === "dashboard" && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatsCard
              title="Total de Cursos"
              value={totalCourses}
              icon={<BookOpen size={20} />}
              iconColor="bg-blue-100 text-blue-600"
            />
            <StatsCard
              title="Alunos Ativos"
              value={activeStudents}
              icon={<Users size={20} />}
              iconColor="bg-green-100 text-green-600"
            />
            <StatsCard
              title="Taxa de Conclusão"
              value={`${completionRate}%`}
              icon={<TrendingUp size={20} />}
              iconColor="bg-purple-100 text-purple-600"
            />
          </div>

          <Card>
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              Progresso por Curso
            </h3>
            <DeferredContent
              height={200}
              label="Carregando progresso por curso"
            >
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar
                    dataKey="concluidos"
                    name="Concluídos"
                    fill="#22c55e"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="em_andamento"
                    name="Em andamento"
                    fill="#3b82f6"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </DeferredContent>
          </Card>
        </div>
      )}

      {activeTab === "cadastro" && (
        <div className="space-y-4">
          {courses.map((course) => (
            <Card key={course.id} padding="none">
              <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() =>
                  setExpandedCourse(
                    expandedCourse === course.id ? null : course.id,
                  )
                }
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <BookOpen size={18} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      {course.title}
                    </p>
                    <p className="text-xs text-gray-400">
                      {course.total_lessons} aulas
                    </p>
                  </div>
                </div>
                {expandedCourse === course.id ? (
                  <ChevronDown size={18} className="text-gray-400" />
                ) : (
                  <ChevronRight size={18} className="text-gray-400" />
                )}
              </div>

              {expandedCourse === course.id && (
                <div className="border-t border-gray-100 px-4 pb-4">
                  <p className="text-xs text-gray-500 py-3">
                    {(details[course.id] ?? course).description}
                  </p>
                  <div className="space-y-2">
                    {(details[course.id] ?? course).lessons.map((lesson, i) => (
                      <div
                        key={lesson.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 w-5">
                            {i + 1}.
                          </span>
                          <span className="text-sm text-gray-700">
                            {lesson.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">
                            {lesson.duration_min} min
                          </span>
                          <button
                            type="button"
                            className="p-1 text-blue-500 hover:bg-blue-50 rounded"
                          >
                            <Play size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {activeTab === "alunos" && (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Vendedor
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Curso
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Progresso
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Score
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Último Acesso
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-gray-400"
                  >
                    Visão consolidada administrativa virá de um endpoint
                    agregado; no painel do cliente você vê o progresso por
                    vendedor.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
