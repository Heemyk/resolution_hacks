"use client";

import { useRef, useEffect, useCallback } from "react";

const VERT_SRC = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision mediump float;

uniform vec2 iResolution;
uniform float iTime;
uniform float iRecording;
uniform sampler2D iChannel0;

const float dots = 40.0;
const float radius = 0.25;
const float brightness = 0.02;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / min(iResolution.x, iResolution.y);
  vec3 c = vec3(0.0, 0.0, 0.1);

  for (float i = 0.0; i < 40.0; i++) {
    float vol = texture2D(iChannel0, vec2(i / dots, 0.0)).x;
    float b = vol * brightness;

    float angle = 2.0 * 3.14159265 * i / dots;
    float x = radius * cos(angle);
    float y = radius * sin(angle);
    vec2 o = vec2(x, y);

    vec3 dotCol = hsv2rgb(vec3((i + iTime * 10.0) / dots, 1.0, 1.0));
    c += b / length(p - o) * dotCol;
  }

  float dist = distance(p, vec2(0.0));
  c = c * smoothstep(0.26, 0.28, dist);

  float inner = smoothstep(0.26, 0.24, dist);
  if (iRecording > 0.5) {
    float pulse = 0.3 + 0.15 * sin(iTime * 3.0);
    c += inner * vec3(pulse, 0.02, 0.02);
  } else {
    c += inner * vec3(0.06, 0.06, 0.12);
  }

  gl_FragColor = vec4(c, 1.0);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

interface AudioVisualizerProps {
  analyserNode: AnalyserNode | null;
  isRecording: boolean;
  onCircleClick: () => void;
}

export default function AudioVisualizer({
  analyserNode,
  isRecording,
  onCircleClick,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const recordingRef = useRef(isRecording);

  useEffect(() => {
    recordingRef.current = isRecording;
  }, [isRecording]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = -((e.clientY - rect.top) / rect.height - 0.5);
      const aspect = rect.width / rect.height;
      const nx = aspect > 1 ? x : x * (rect.width / rect.height);
      const ny = aspect > 1 ? y * (rect.height / rect.width) : y;
      if (Math.sqrt(nx * nx + ny * ny) < 0.26) {
        onCircleClick();
      }
    },
    [onCircleClick],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) return;

    const vert = createShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const frag = createShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vert || !frag) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, "iResolution");
    const uTime = gl.getUniformLocation(program, "iTime");
    const uRecording = gl.getUniformLocation(program, "iRecording");
    const uChannel0 = gl.getUniformLocation(program, "iChannel0");

    const audioTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, audioTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(uChannel0, 0);

    const freqData = new Uint8Array(256);
    const texPixels = new Uint8Array(256 * 4);
    const startTime = performance.now();

    function render() {
      if (!canvas || !gl) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);

      if (analyserNode) {
        analyserNode.getByteFrequencyData(freqData);
      } else {
        freqData.fill(0);
      }
      for (let i = 0; i < 256; i++) {
        const v = freqData[i];
        texPixels[i * 4] = v;
        texPixels[i * 4 + 1] = v;
        texPixels[i * 4 + 2] = v;
        texPixels[i * 4 + 3] = 255;
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, audioTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, texPixels);

      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, (performance.now() - startTime) / 1000);
      gl.uniform1f(uRecording, recordingRef.current ? 1.0 : 0.0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      gl.deleteBuffer(buf);
      gl.deleteTexture(audioTex);
    };
  }, [analyserNode]);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="w-full h-full cursor-pointer"
      style={{ display: "block" }}
    />
  );
}
