"use client";
import { useState } from "react";
import { browserLocation } from "@/lib/commerce/location";
export function PinPicker() {
  const [lat, setLat] = useState(""),
    [lng, setLng] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [manual, setManual] = useState(false);
  async function locate() {
    setBusy(true);
    setError("");
    try {
      const point = await browserLocation();
      setLat(point.latitude.toFixed(6));
      setLng(point.longitude.toFixed(6));
    } catch {
      setError(
        "No pudimos obtener tu ubicación. Podés ingresar o corregir el pin manualmente.",
      );
      setManual(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset className="pin-picker">
      <legend>Pin de entrega</legend>
      <p>
        Usá tu ubicación si estás en el lugar de entrega. La dirección escrita
        sigue siendo necesaria.
      </p>
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={() => void locate()}
      >
        {busy ? "BUSCANDO UBICACIÓN…" : "USAR MI UBICACIÓN"}
      </button>
      {lat && lng && (
        <p role="status">
          Pin seleccionado: {lat}, {lng}
        </p>
      )}
      <button
        type="button"
        className="text-button"
        aria-expanded={manual}
        onClick={() => setManual(!manual)}
      >
        AJUSTAR PIN MANUALMENTE
      </button>
      <p className="caption">
        Mapa visual no configurado. Podés copiar las coordenadas de tu mapa.
      </p>
      {error && <p role="alert">{error}</p>}
      <div hidden={!manual}>
        <label>
          Latitud
          <input
            name="delivery_latitude"
            type="number"
            step="any"
            min="-90"
            max="90"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            required
            onInvalid={() => setManual(true)}
          />
        </label>
        <label>
          Longitud
          <input
            name="delivery_longitude"
            type="number"
            step="any"
            min="-180"
            max="180"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            required
            onInvalid={() => setManual(true)}
          />
        </label>
      </div>
    </fieldset>
  );
}
