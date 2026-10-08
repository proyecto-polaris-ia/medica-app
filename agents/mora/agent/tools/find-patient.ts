import { defineTool } from "eve/tools";
import { z } from "zod";

import { authorizeAndResolvePatient, type DoctorAccessContext } from "../access";

const findPatientInputSchema = z.object({
  patientPhone: z
    .string()
    .trim()
    .optional()
    .describe(
      "Teléfono registrado del paciente en el consultorio (cualquier formato; se normaliza a E.164)",
    ),
  patientName: z
    .string()
    .trim()
    .optional()
    .describe("Nombre del paciente tal como está registrado en el consultorio"),
});

type FindPatientInput = z.infer<typeof findPatientInputSchema>;

export default defineTool({
  description:
    "Busca un paciente por teléfono registrado o nombre para que el doctor confirme a quién consultar antes de operar sobre saldos. Exclusiva para doctores autorizados; devuelve solo datos de identidad (nombre y teléfono), nunca saldos ni datos financieros.",
  inputSchema: findPatientInputSchema,
  async execute(input: FindPatientInput, ctx: DoctorAccessContext) {
    const target = await authorizeAndResolvePatient(ctx, {
      patientPhone: input.patientPhone,
      patientName: input.patientName,
    });
    if ("error" in target) {
      return { success: false, error: target.error };
    }
    if ("candidates" in target) {
      return {
        success: true,
        resolved: false,
        candidates: target.candidates,
        message:
          "Encontré varios pacientes con ese nombre. Indica el teléfono registrado del paciente elegido para continuar.",
      };
    }
    if ("notFound" in target) {
      return {
        success: true,
        resolved: false,
        candidates: [],
        message:
          "No encontré un paciente con esa referencia. Verifica el nombre o el teléfono registrado en el consultorio.",
      };
    }

    const patient = target.patient;
    return {
      success: true,
      resolved: true,
      patient: {
        id: patient.id,
        fullName: patient.full_name,
        phoneE164: patient.phone_e164,
      },
      message: `Paciente identificado: ${patient.full_name} (${patient.phone_e164}).`,
    };
  },
});
