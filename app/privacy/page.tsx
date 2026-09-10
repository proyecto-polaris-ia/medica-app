import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Aviso de privacidad | Medica App',
  description: 'Aviso de privacidad para el canal de WhatsApp de Medica App.',
};

export default function PrivacyPolicyPage() {
  const updatedAt = '10 de septiembre de 2026';

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-slate-900">
      <section className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-500">Última actualización: {updatedAt}</p>
          <h1 className="text-3xl font-bold tracking-tight">Aviso de privacidad</h1>
          <p className="text-slate-700">
            Este aviso explica cómo Medica App trata la información recibida a través de sus canales digitales,
            incluyendo WhatsApp, para apoyar la atención administrativa de un consultorio dental.
          </p>
        </div>

        <PolicySection title="Información que podemos recopilar">
          <p>
            Podemos recopilar datos de contacto, nombre, número telefónico, mensajes enviados por WhatsApp,
            solicitudes de cita, preferencias de horario y datos administrativos necesarios para dar seguimiento a
            una conversación o agenda.
          </p>
        </PolicySection>

        <PolicySection title="Uso de la información">
          <p>
            Usamos la información para responder mensajes, gestionar solicitudes de cita, confirmar disponibilidad,
            dar seguimiento administrativo, mejorar la operación del consultorio y mantener trazabilidad de la
            comunicación con pacientes.
          </p>
        </PolicySection>

        <PolicySection title="Información sensible">
          <p>
            El canal de WhatsApp no sustituye una consulta médica u odontológica. No debe usarse para diagnóstico,
            recetas, urgencias graves ni envío de información clínica sensible que requiera valoración profesional
            directa. Cuando una solicitud lo requiera, se canalizará con una persona del consultorio.
          </p>
        </PolicySection>

        <PolicySection title="Compartición de información">
          <p>
            No vendemos datos personales. Podemos compartir información únicamente con personal autorizado del
            consultorio y proveedores tecnológicos necesarios para operar el servicio, como infraestructura de
            hosting, base de datos y mensajería.
          </p>
        </PolicySection>

        <PolicySection title="Conservación y seguridad">
          <p>
            Conservamos la información durante el tiempo necesario para operar el servicio, atender solicitudes y
            cumplir obligaciones aplicables. Aplicamos medidas razonables de seguridad para proteger la información
            contra acceso no autorizado, pérdida o uso indebido.
          </p>
        </PolicySection>

        <PolicySection title="Derechos de privacidad">
          <p>
            Puedes solicitar acceso, corrección o eliminación de tus datos personales escribiendo al consultorio por
            el mismo canal de contacto por el que recibiste atención.
          </p>
        </PolicySection>

        <PolicySection title="Cambios al aviso">
          <p>
            Este aviso puede actualizarse para reflejar cambios operativos, legales o tecnológicos. La versión vigente
            estará disponible en esta página.
          </p>
        </PolicySection>
      </section>
    </main>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="leading-7 text-slate-700">{children}</div>
    </section>
  );
}
