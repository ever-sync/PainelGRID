import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { PageHeader } from "../../components/shared/PageHeader";
import { Card } from "../../components/ui/Card";
import { BookOpen, Trophy } from "lucide-react";
import type { User } from "../../types";
import { resolveClientId } from "../../utils/userContext";
import { MissingClientScope } from "../../components/shared/MissingClientScope";
import { readStoredSession } from "../../services/auth";
import {
  listCourses,
  mapApiCourseToCourse,
  vendorCourseProgress,
  type ApiProgressRow,
} from "../../services/coursesApi";
import { listClientStaff, mapStaffToUser } from "../../services/staff";
import type { Course } from "../../types";

type OutletContext = {
  user: User;
};

export function CursosClientePage() {
  const { user } = useOutletContext<OutletContext>();
  const clientId = resolveClientId(user);

  const [courses, setCourses] = useState<Course[]>([]);
  const [enabledCourses, setEnabledCourses] = useState<Set<string>>(new Set());
  const [vendorProgress, setVendorProgress] = useState<
    Record<string, ApiProgressRow[]>
  >({});
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!token) return;
    void listCourses(token).then((rows) => {
      const mapped = rows.map(mapApiCourseToCourse);
      setCourses(mapped);
      setEnabledCourses(new Set(mapped.map((c) => c.id)));
    });
  }, []);

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!clientId || !token) return;
    void listClientStaff(clientId, token).then((rows) => {
      const v = rows.filter((r) => r.role === "vendedor").map(mapStaffToUser);
      setVendors(v.map((u) => ({ id: u.id, name: u.name })));
    });
  }, [clientId]);

  useEffect(() => {
    const token = readStoredSession()?.accessToken;
    if (!token || vendors.length === 0) return;
    void Promise.all(
      vendors.map((v) =>
        vendorCourseProgress(v.id, token).then((rows) => ({ id: v.id, rows })),
      ),
    ).then((pairs) => {
      const next: Record<string, ApiProgressRow[]> = {};
      pairs.forEach(({ id, rows }) => {
        next[id] = rows;
      });
      setVendorProgress(next);
    });
  }, [vendors]);

  // A guarda vem depois dos hooks: se ela ficasse antes, um `clientId` que
  // chega depois (contexto assincrono) mudaria a quantidade de hooks entre
  // renders e o React derrubaria a tela.
  const missingClientScope = !clientId;

  const toggleCourse = (courseId: string) => {
    setEnabledCourses((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  const vendorSummary = vendors
    .map((v) => {
      const progresses = vendorProgress[v.id] ?? [];
      const assigned = new Set(progresses.map((p) => p.course_id)).size;
      const completed = courses.filter((c) => {
        const forC = progresses.filter((p) => p.course_id === c.id);
        if (!forC.length) return false;
        const done = forC.filter((p) => p.completed).length;
        return done >= c.total_lessons;
      }).length;
      const scores = progresses
        .map((p) => p.score)
        .filter((s): s is number => s != null);
      const avgScore = scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;
      return { ...v, assigned, completed, avgScore };
    })
    .sort((a, b) => b.avgScore - a.avgScore);

  const medalColors = ["text-yellow-500", "text-gray-400", "text-orange-400"];

  if (missingClientScope) return <MissingClientScope />;

  return (
    <div>
      <PageHeader
        title="Cursos"
        breadcrumbs={[{ label: "TechStore" }, { label: "Cursos" }]}
      />

      <div className="mb-8">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          Cursos Disponíveis
        </h3>
        <div className="space-y-3">
          {courses.map((course) => {
            const enabled = enabledCourses.has(course.id);
            return (
              <Card
                key={course.id}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <BookOpen size={18} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">
                      {course.title}
                    </p>
                    <p className="text-xs text-gray-400">
                      {course.total_lessons} aulas •{" "}
                      {course.description.slice(0, 60)}
                      {course.description.length > 60 ? "..." : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleCourse(course.id)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    enabled ? "bg-blue-500" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${
                      enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          Progresso dos Vendedores
        </h3>
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Vendedor
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Cursos Atribuídos
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Concluídos
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Score Médio
                  </th>
                </tr>
              </thead>
              <tbody>
                {vendorSummary.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-gray-50 last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {v.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{v.assigned}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-green-600">
                        {v.completed}
                      </span>
                      <span className="text-gray-400"> / {v.assigned}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-bold text-base ${
                          v.avgScore >= 80
                            ? "text-green-600"
                            : v.avgScore >= 60
                              ? "text-yellow-500"
                              : "text-red-500"
                        }`}
                      >
                        {v.avgScore}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          Ranking — Top 3 Vendedores
        </h3>
        <div className="flex flex-col md:flex-row gap-4">
          {vendorSummary.slice(0, 3).map((v, i) => (
            <Card key={v.id} className="flex-1 text-center">
              <Trophy size={28} className={`mx-auto mb-2 ${medalColors[i]}`} />
              <p className="font-bold text-gray-900">{v.name.split(" ")[0]}</p>
              <p className="text-3xl font-extrabold text-blue-500 my-2">
                {v.avgScore}
              </p>
              <p className="text-xs text-gray-400">Score médio</p>
              <p className="text-xs text-gray-400 mt-1">
                {v.completed}/{v.assigned} cursos concluídos
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
