import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
export default function Viewer({
  model,
  color,
}: {
  model: string;
  color: string;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const commands = useRef<
    (action: "left" | "right" | "up" | "down" | "in" | "out" | "reset") => void
  >(() => {});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const target = mount.current;
    if (!target || failed) return;
    let renderer: THREE.WebGLRenderer | undefined;
    let frame = 0;
    let observer: ResizeObserver | undefined;
    const scene = new THREE.Scene();
    let controls: OrbitControls | undefined;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setClearColor("#f5f2eb");
      target.appendChild(renderer.domElement);
      renderer.domElement.setAttribute(
        "aria-label",
        "Interactive demo furniture. Drag to rotate, pinch or scroll to zoom.",
      );
      renderer.domElement.setAttribute("role", "img");

      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      camera.position.set(5, 3.5, 5);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0.7, 0);
      controls.enableDamping = true;
      controls.minDistance = 3;
      controls.maxDistance = 10;
      controls.minPolarAngle = 0.15;
      controls.maxPolarAngle = Math.PI / 2;
      controls.enablePan = false;
      controls.update();
      controls.saveState();
      commands.current = (action) => {
        if (action === "reset") {
          controls!.reset();
          return;
        }
        const offset = camera.position.clone().sub(controls!.target);
        if (action === "left" || action === "right")
          offset.applyAxisAngle(
            new THREE.Vector3(0, 1, 0),
            action === "left" ? 0.3 : -0.3,
          );
        else if (action === "up" || action === "down") {
          const spherical = new THREE.Spherical().setFromVector3(offset);
          spherical.phi = THREE.MathUtils.clamp(
            spherical.phi + (action === "up" ? -0.25 : 0.25),
            0.15,
            Math.PI / 2,
          );
          offset.setFromSpherical(spherical);
        } else
          offset.setLength(
            THREE.MathUtils.clamp(
              offset.length() * (action === "in" ? 0.85 : 1.15),
              3,
              10,
            ),
          );
        camera.position.copy(controls!.target).add(offset);
        controls!.update();
      };
      scene.add(new THREE.HemisphereLight(0xffffff, 0x746b51, 3));
      const light = new THREE.DirectionalLight(0xffffff, 3);
      light.position.set(4, 7, 5);
      scene.add(light);
      const wood = new THREE.MeshStandardMaterial({
        color: color === "Walnut" ? "#705039" : "#be956d",
        roughness: 0.85,
      });
      const fabric = new THREE.MeshStandardMaterial({
        color:
          color === "Olive"
            ? "#76815b"
            : color === "Sand"
              ? "#d0bc96"
              : "#b1a089",
        roughness: 1,
      });
      const box = (
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        d: number,
        mat: THREE.Material,
      ) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, y, z);
        scene.add(mesh);
      };
      if (model === "sofas") {
        box(0, 0.7, 0, 3, 0.35, 1.2, fabric);
        box(0, 1.2, -0.5, 3, 1, 0.25, fabric);
        box(-1.5, 0.95, 0, 0.3, 0.8, 1.3, fabric);
        box(1.5, 0.95, 0, 0.3, 0.8, 1.3, fabric);
      } else {
        box(0, 1.3, 0, model === "dining" ? 3 : 2.4, 0.17, 1.4, wood);
      }
      for (const x of [-1, 1])
        for (const z of [-0.45, 0.45])
          box(
            x,
            model === "sofas" ? 0.28 : 0.65,
            z,
            0.12,
            model === "sofas" ? 0.55 : 1.3,
            0.12,
            wood,
          );
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({ color: "#e7e1d6" }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = -0.04;
      scene.add(plane);
      const resize = () => {
        if (!renderer) return;
        renderer.setSize(
          target.clientWidth,
          Math.max(250, target.clientHeight),
        );
        camera.aspect = target.clientWidth / Math.max(250, target.clientHeight);
        camera.updateProjectionMatrix();
      };
      observer = new ResizeObserver(resize);
      observer.observe(target);
      resize();
      const animate = () => {
        frame = requestAnimationFrame(animate);
        controls?.update();
        renderer?.render(scene, camera);
      };
      animate();
      const lost = (e: Event) => {
        e.preventDefault();
        setFailed(true);
      };
      renderer.domElement.addEventListener("webglcontextlost", lost);
    } catch {
      setFailed(true);
    }
    return () => {
      commands.current = () => {};
      cancelAnimationFrame(frame);
      observer?.disconnect();
      controls?.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = Array.isArray(o.material) ? o.material : [o.material];
          m.forEach((material) => material.dispose());
        }
      });
      renderer?.dispose();
      // React may reuse this div for its fallback; remove only our own canvas.
      renderer?.domElement.remove();
    };
  }, [model, color, failed]);
  return (
    <div className="viewer-wrap">
      {failed ? (
        <div className="empty">
          <h3>3D is unavailable on this device.</h3>
          <p>Choose a gallery thumbnail to explore this design.</p>
        </div>
      ) : (
        <>
          <div className="viewer" ref={mount} />
          <div
            className="viewer-controls"
            role="group"
            aria-label="3D view controls"
          >
            <button
              type="button"
              aria-label="Rotate model left"
              onClick={() => commands.current("left")}
            >
              ↶
            </button>
            <button
              type="button"
              aria-label="Rotate model right"
              onClick={() => commands.current("right")}
            >
              ↷
            </button>
            <button
              type="button"
              aria-label="Zoom model in"
              onClick={() => commands.current("in")}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Zoom model out"
              onClick={() => commands.current("out")}
            >
              −
            </button>
            <button
              type="button"
              aria-label="Rotate model up"
              onClick={() => commands.current("up")}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Rotate model down"
              onClick={() => commands.current("down")}
            >
              ↓
            </button>
            <button
              type="button"
              aria-label="Reset model view"
              onClick={() => commands.current("reset")}
            >
              Reset
            </button>
          </div>
          <span className="viewer-label">
            DEMO GEOMETRY · Drag to rotate · Scroll to zoom
          </span>
        </>
      )}
    </div>
  );
}
