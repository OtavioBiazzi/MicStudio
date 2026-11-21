// VozLabAudioTap: captura o som de apps especificos do Windows para o "Compartilhar tela" das salas.
//
// O Chromium so sabe capturar o som do PC inteiro, o que manda junto o Discord (eco) e a voz modificada do proprio
// VozLab. Este ajudante usa a captura por processo do Windows 10 2004+ (Process Loopback) para:
//   --app <hwnd>     capturar so o app dono da janela compartilhada;
//   --system         capturar todos os apps que estao tocando som, menos Discord e VozLab.
// Saida: PCM 16 bits, 48 kHz, estereo, continuo, no stdout. Avisos em JSON (uma linha cada) no stderr.
//
// Compilar: C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /optimize /platform:x64 /target:exe
//           /out:native-dist\VozLabAudioTap.exe native\VozLabAudioTap.cs

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace VozLab
{
    [StructLayout(LayoutKind.Sequential)]
    struct WAVEFORMATEX
    {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct AUDIOCLIENT_ACTIVATION_PARAMS
    {
        public int ActivationType; // 1 = process loopback
        public uint TargetProcessId;
        public int ProcessLoopbackMode; // 0 = incluir a arvore do processo
    }

    [StructLayout(LayoutKind.Explicit, Size = 24)]
    struct PROPVARIANT_BLOB
    {
        [FieldOffset(0)] public ushort vt; // VT_BLOB = 65
        [FieldOffset(8)] public int cbSize;
        [FieldOffset(16)] public IntPtr pBlobData;
    }

    [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceCompletionHandler
    {
        void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
    }

    [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IActivateAudioInterfaceAsyncOperation
    {
        void GetActivateResult(out int activateResult, [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
    }

    [ComImport, Guid("94ea2b94-e9cc-49e0-c0ff-ee64ca8f5b90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAgileObject { }

    [ComImport, Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, uint streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr sessionGuid);
        [PreserveSig] int GetBufferSize(out uint frames);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out uint padding);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, IntPtr closest);
        [PreserveSig] int GetMixFormat(out IntPtr format);
        [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr handle);
        [PreserveSig] int GetService([MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }

    [ComImport, Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong qpcPosition);
        [PreserveSig] int ReleaseBuffer(uint frames);
        [PreserveSig] int GetNextPacketSize(out uint frames);
    }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
        [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int Item(uint index, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        [PreserveSig] int Activate([MarshalAs(UnmanagedType.LPStruct)] Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(IntPtr sessionGuid, int streamFlags, out IntPtr control);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr sessionGuid, int streamFlags, out IntPtr volume);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session);
    }

    [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName(out IntPtr name);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr context);
        [PreserveSig] int GetIconPath(out IntPtr path);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, IntPtr context);
        [PreserveSig] int GetGroupingParam(out Guid param);
        [PreserveSig] int SetGroupingParam(ref Guid param, IntPtr context);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr client);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr client);
        [PreserveSig] int GetSessionIdentifier(out IntPtr id);
        [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr id);
        [PreserveSig] int GetProcessId(out uint pid);
        [PreserveSig] int IsSystemSoundsSession();
        [PreserveSig] int SetDuckingPreference(bool optOut);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumeratorCom { }

    // Recebe o aviso de que a ativacao assincrona terminou. Precisa ser "agil" para o Windows chamar de qualquer thread.
    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    class ActivationHandler : IActivateAudioInterfaceCompletionHandler, IAgileObject
    {
        public readonly ManualResetEvent Done = new ManualResetEvent(false);
        public IActivateAudioInterfaceAsyncOperation Operation;
        public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation)
        {
            Operation = activateOperation;
            Done.Set();
        }
    }

    static class Native
    {
        [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = true)]
        public static extern int ActivateAudioInterfaceAsync(
            [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
            [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
            IntPtr activationParams,
            IActivateAudioInterfaceCompletionHandler completionHandler,
            out IActivateAudioInterfaceAsyncOperation activationOperation);

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        public static extern bool Process32FirstW(IntPtr snapshot, ref PROCESSENTRY32 entry);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        public static extern bool Process32NextW(IntPtr snapshot, ref PROCESSENTRY32 entry);

        [DllImport("kernel32.dll")]
        public static extern bool CloseHandle(IntPtr handle);

        [DllImport("ole32.dll")]
        public static extern void CoTaskMemFree(IntPtr ptr);
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PROCESSENTRY32
    {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public IntPtr th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
    }

    class ProcessInfo
    {
        public uint Pid;
        public uint Parent;
        public string Name;
    }

    // Uma captura de um processo (e dos filhos dele).
    class Tap : IDisposable
    {
        public const int Rate = 48000;
        public const int Channels = 2;
        public readonly uint Pid;
        public readonly string Name;
        readonly IAudioClient client;
        readonly IAudioCaptureClient capture;
        readonly AutoResetEvent ready = new AutoResetEvent(false);
        readonly Thread thread;
        readonly short[] ring = new short[Rate * Channels]; // 1 segundo
        int readPos, count;
        volatile bool running = true;
        public bool Primed;

        public Tap(uint pid, string name)
        {
            Pid = pid;
            Name = name;
            client = Activate(pid);
            IntPtr format = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(WAVEFORMATEX)));
            try
            {
                var wfx = new WAVEFORMATEX { wFormatTag = 1, nChannels = Channels, nSamplesPerSec = Rate, wBitsPerSample = 16, nBlockAlign = Channels * 2, nAvgBytesPerSec = Rate * Channels * 2, cbSize = 0 };
                Marshal.StructureToPtr(wfx, format, false);
                const uint LOOPBACK = 0x00020000, EVENTCALLBACK = 0x00040000, AUTOCONVERTPCM = 0x80000000, SRC_DEFAULT_QUALITY = 0x08000000;
                Check(client.Initialize(0, LOOPBACK | EVENTCALLBACK | AUTOCONVERTPCM | SRC_DEFAULT_QUALITY, 200000, 0, format, IntPtr.Zero), "Initialize");
            }
            finally
            {
                Marshal.FreeHGlobal(format);
            }
            Check(client.SetEventHandle(ready.SafeWaitHandle.DangerousGetHandle()), "SetEventHandle");
            object service;
            Check(client.GetService(typeof(IAudioCaptureClient).GUID, out service), "GetService");
            capture = (IAudioCaptureClient)service;
            Check(client.Start(), "Start");
            thread = new Thread(Loop) { IsBackground = true, Name = "tap-" + pid };
            thread.Start();
        }

        static void Check(int hr, string what)
        {
            if (hr < 0) throw new COMException(what + " falhou", hr);
        }

        static IAudioClient Activate(uint pid)
        {
            var parameters = new AUDIOCLIENT_ACTIVATION_PARAMS { ActivationType = 1, TargetProcessId = pid, ProcessLoopbackMode = 0 };
            IntPtr paramsPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(AUDIOCLIENT_ACTIVATION_PARAMS)));
            IntPtr variantPtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(PROPVARIANT_BLOB)));
            try
            {
                Marshal.StructureToPtr(parameters, paramsPtr, false);
                var variant = new PROPVARIANT_BLOB { vt = 65, cbSize = Marshal.SizeOf(typeof(AUDIOCLIENT_ACTIVATION_PARAMS)), pBlobData = paramsPtr };
                Marshal.StructureToPtr(variant, variantPtr, false);
                var handler = new ActivationHandler();
                IActivateAudioInterfaceAsyncOperation operation;
                Check(Native.ActivateAudioInterfaceAsync("VAD\\Process_Loopback", typeof(IAudioClient).GUID, variantPtr, handler, out operation), "ActivateAudioInterfaceAsync");
                if (!handler.Done.WaitOne(5000)) throw new TimeoutException("ativacao demorou demais");
                int result;
                object activated;
                handler.Operation.GetActivateResult(out result, out activated);
                Check(result, "GetActivateResult");
                return (IAudioClient)activated;
            }
            finally
            {
                Marshal.FreeHGlobal(variantPtr);
                Marshal.FreeHGlobal(paramsPtr);
            }
        }

        void Loop()
        {
            var scratch = new short[Rate * Channels / 10];
            while (running)
            {
                ready.WaitOne(100);
                uint packet;
                while (running && capture.GetNextPacketSize(out packet) >= 0 && packet > 0)
                {
                    IntPtr data;
                    uint frames, flags;
                    ulong devicePosition, qpc;
                    if (capture.GetBuffer(out data, out frames, out flags, out devicePosition, out qpc) < 0) break;
                    int samples = (int)frames * Channels;
                    if (samples > scratch.Length) scratch = new short[samples];
                    if ((flags & 0x2) != 0 || data == IntPtr.Zero) Array.Clear(scratch, 0, samples); // AUDCLNT_BUFFERFLAGS_SILENT
                    else Marshal.Copy(data, scratch, 0, samples);
                    capture.ReleaseBuffer(frames);
                    Write(scratch, samples);
                }
            }
        }

        void Write(short[] source, int samples)
        {
            lock (ring)
            {
                for (int i = 0; i < samples; i++)
                {
                    int writePos = (readPos + count) % ring.Length;
                    ring[writePos] = source[i];
                    if (count < ring.Length) count++;
                    else readPos = (readPos + 1) % ring.Length; // cheio: descarta o mais antigo
                }
            }
        }

        public int Available
        {
            get { lock (ring) return count; }
        }

        // Soma ate `samples` amostras no mix. Antes de tocar, espera ter 40 ms guardados (evita picotar).
        public void MixInto(int[] mix, int samples)
        {
            lock (ring)
            {
                if (!Primed)
                {
                    if (count < Rate * Channels / 25) return;
                    Primed = true;
                }
                int take = Math.Min(samples, count);
                for (int i = 0; i < take; i++)
                {
                    mix[i] += ring[readPos];
                    readPos = (readPos + 1) % ring.Length;
                }
                count -= take;
                if (take < samples) Primed = false;
                // Se acumulou demais (atraso), pula para perto do fim.
                int limit = Rate * Channels / 5;
                if (count > limit)
                {
                    int drop = count - Rate * Channels / 25;
                    readPos = (readPos + drop) % ring.Length;
                    count -= drop;
                }
            }
        }

        public void Dispose()
        {
            running = false;
            try { client.Stop(); } catch { }
            try { thread.Join(500); } catch { }
            try { Marshal.ReleaseComObject(capture); } catch { }
            try { Marshal.ReleaseComObject(client); } catch { }
        }
    }

    static class Program
    {
        static readonly string[] BlockedNames = { "discord", "discordptb", "discordcanary", "discorddevelopment", "vozlab", "vozlab studio", "micfudiddo studio", "micfudiddobackend", "vozlabaudiotap", "audiodg" };
        static readonly HashSet<uint> BlockedPids = new HashSet<uint>();
        static readonly object Gate = new object();
        static readonly Dictionary<uint, Tap> Taps = new Dictionary<uint, Tap>();
        static readonly HashSet<uint> Failed = new HashSet<uint>();
        static readonly Stream Output = Console.OpenStandardOutput();
        static string lastReport = "";

        static void Emit(string json)
        {
            try
            {
                var err = Console.Error;
                err.WriteLine(json);
                err.Flush();
            }
            catch { }
        }

        static string Quote(string text)
        {
            var sb = new StringBuilder("\"");
            foreach (char c in text ?? "")
            {
                if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                else if (c < 32) sb.Append(' ');
                else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }

        static bool IsBlockedName(string name)
        {
            string lower = (name ?? "").ToLowerInvariant();
            if (lower.EndsWith(".exe")) lower = lower.Substring(0, lower.Length - 4);
            foreach (var blocked in BlockedNames) if (lower == blocked) return true;
            return lower.StartsWith("discord");
        }

        static Dictionary<uint, ProcessInfo> Snapshot()
        {
            var map = new Dictionary<uint, ProcessInfo>();
            IntPtr snap = Native.CreateToolhelp32Snapshot(0x2, 0);
            if (snap == IntPtr.Zero || snap == new IntPtr(-1)) return map;
            try
            {
                var entry = new PROCESSENTRY32 { dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32)) };
                if (Native.Process32FirstW(snap, ref entry))
                {
                    do
                    {
                        map[entry.th32ProcessID] = new ProcessInfo { Pid = entry.th32ProcessID, Parent = entry.th32ParentProcessID, Name = entry.szExeFile };
                    } while (Native.Process32NextW(snap, ref entry));
                }
            }
            finally
            {
                Native.CloseHandle(snap);
            }
            return map;
        }

        static bool IsBlocked(ProcessInfo info)
        {
            return info == null || BlockedPids.Contains(info.Pid) || IsBlockedName(info.Name);
        }

        // Capturar um processo pega os filhos junto. Se algum filho for o Discord ou o VozLab, nao da para usar.
        static bool TreeHasBlocked(uint root, Dictionary<uint, ProcessInfo> map)
        {
            var children = new Dictionary<uint, List<uint>>();
            foreach (var info in map.Values)
            {
                if (info.Pid == info.Parent) continue;
                List<uint> list;
                if (!children.TryGetValue(info.Parent, out list)) children[info.Parent] = list = new List<uint>();
                list.Add(info.Pid);
            }
            var stack = new Stack<uint>();
            var seen = new HashSet<uint>();
            stack.Push(root);
            while (stack.Count > 0)
            {
                uint pid = stack.Pop();
                if (!seen.Add(pid)) continue;
                ProcessInfo info;
                if (pid != root && map.TryGetValue(pid, out info) && IsBlocked(info)) return true;
                List<uint> list;
                if (children.TryGetValue(pid, out list)) foreach (var child in list) stack.Push(child);
            }
            return false;
        }

        static bool HasAncestorIn(uint pid, HashSet<uint> set, Dictionary<uint, ProcessInfo> map)
        {
            var seen = new HashSet<uint>();
            ProcessInfo info;
            while (map.TryGetValue(pid, out info) && seen.Add(pid))
            {
                if (info.Parent == 0 || info.Parent == pid) break;
                if (set.Contains(info.Parent)) return true;
                pid = info.Parent;
            }
            return false;
        }

        // Todos os processos que tem uma sessao de audio em qualquer saida ativa.
        static HashSet<uint> SessionPids()
        {
            var pids = new HashSet<uint>();
            IMMDeviceEnumerator enumerator = null;
            try
            {
                enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorCom();
                IMMDeviceCollection devices;
                if (enumerator.EnumAudioEndpoints(0, 1, out devices) < 0) return pids; // eRender, DEVICE_STATE_ACTIVE
                uint deviceCount;
                devices.GetCount(out deviceCount);
                for (uint d = 0; d < deviceCount; d++)
                {
                    IMMDevice device;
                    if (devices.Item(d, out device) < 0) continue;
                    object managerObject;
                    if (device.Activate(typeof(IAudioSessionManager2).GUID, 23, IntPtr.Zero, out managerObject) < 0) continue;
                    var manager = (IAudioSessionManager2)managerObject;
                    IAudioSessionEnumerator sessions;
                    if (manager.GetSessionEnumerator(out sessions) < 0) continue;
                    int count;
                    sessions.GetCount(out count);
                    for (int i = 0; i < count; i++)
                    {
                        object sessionObject;
                        if (sessions.GetSession(i, out sessionObject) < 0) continue;
                        var session = sessionObject as IAudioSessionControl2;
                        if (session == null) continue;
                        int state;
                        session.GetState(out state);
                        if (state == 2) continue; // expirada
                        if (session.IsSystemSoundsSession() == 0) continue; // sons do sistema
                        uint pid;
                        if (session.GetProcessId(out pid) >= 0 && pid != 0) pids.Add(pid);
                    }
                }
            }
            catch (Exception error)
            {
                Emit("{\"type\":\"warn\",\"message\":" + Quote(error.Message) + "}");
            }
            return pids;
        }

        static void StartTap(uint pid, string name)
        {
            lock (Gate)
            {
                if (Taps.ContainsKey(pid) || Failed.Contains(pid)) return;
            }
            try
            {
                var tap = new Tap(pid, name);
                lock (Gate) Taps[pid] = tap;
            }
            catch (Exception error)
            {
                lock (Gate) Failed.Add(pid);
                Emit("{\"type\":\"warn\",\"pid\":" + pid + ",\"message\":" + Quote(error.Message) + "}");
            }
        }

        static void Report()
        {
            var names = new List<string>();
            lock (Gate) foreach (var tap in Taps.Values) if (!names.Contains(tap.Name)) names.Add(tap.Name);
            names.Sort(StringComparer.OrdinalIgnoreCase);
            var sb = new StringBuilder("{\"type\":\"sources\",\"names\":[");
            for (int i = 0; i < names.Count; i++) { if (i > 0) sb.Append(','); sb.Append(Quote(names[i])); }
            string json = sb.Append("]}").ToString();
            if (json != lastReport) { lastReport = json; Emit(json); }
        }

        static void RefreshSystem()
        {
            var map = Snapshot();
            var candidates = new List<uint>();
            foreach (var pid in SessionPids())
            {
                ProcessInfo info;
                if (!map.TryGetValue(pid, out info) || IsBlocked(info) || TreeHasBlocked(pid, map)) continue;
                candidates.Add(pid);
            }
            var accepted = new HashSet<uint>(candidates);
            foreach (var pid in candidates)
            {
                if (HasAncestorIn(pid, accepted, map)) continue; // o pai ja captura este processo
                StartTap(pid, CleanName(map[pid].Name));
            }
            // Processos que fecharam saem da mistura.
            lock (Gate)
            {
                var gone = new List<uint>();
                foreach (var pid in Taps.Keys) if (!map.ContainsKey(pid)) gone.Add(pid);
                foreach (var pid in gone) { Taps[pid].Dispose(); Taps.Remove(pid); }
            }
            Report();
        }

        static string CleanName(string exe)
        {
            string name = exe ?? "";
            return name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? name.Substring(0, name.Length - 4) : name;
        }

        // Mistura tudo e escreve 10 ms por vez, no ritmo do relogio.
        static void MixLoop()
        {
            const int chunkFrames = Tap.Rate / 100;
            const int chunkSamples = chunkFrames * Tap.Channels;
            var mix = new int[chunkSamples];
            var bytes = new byte[chunkSamples * 2];
            var clock = Stopwatch.StartNew();
            long chunk = 0;
            while (true)
            {
                long due = chunk * 10;
                long wait = due - clock.ElapsedMilliseconds;
                if (wait > 0) Thread.Sleep((int)wait);
                Array.Clear(mix, 0, mix.Length);
                lock (Gate) foreach (var tap in Taps.Values) tap.MixInto(mix, chunkSamples);
                for (int i = 0; i < chunkSamples; i++)
                {
                    int value = mix[i];
                    if (value > short.MaxValue) value = short.MaxValue;
                    else if (value < short.MinValue) value = short.MinValue;
                    bytes[i * 2] = (byte)(value & 0xff);
                    bytes[i * 2 + 1] = (byte)((value >> 8) & 0xff);
                }
                try
                {
                    Output.Write(bytes, 0, bytes.Length);
                    Output.Flush();
                }
                catch
                {
                    Environment.Exit(0); // o VozLab fechou o cano: acabou
                }
                chunk++;
                if (clock.ElapsedMilliseconds - chunk * 10 > 500) chunk = clock.ElapsedMilliseconds / 10; // atrasou muito: recomeca
            }
        }

        [MTAThread]
        static int Main(string[] args)
        {
            string mode = "";
            long hwnd = 0;
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--system") mode = "system";
                else if (args[i] == "--app" && i + 1 < args.Length) { mode = "app"; long.TryParse(args[++i], out hwnd); }
                else if (args[i] == "--exclude-pid" && i + 1 < args.Length) { uint pid; if (uint.TryParse(args[++i], out pid)) BlockedPids.Add(pid); }
                else if (args[i] == "--list") mode = "list";
            }
            BlockedPids.Add((uint)Process.GetCurrentProcess().Id);
            // Environment.OSVersion "mente" sem manifesto; o numero do build vem do registro.
            int build = 0;
            try
            {
                using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion"))
                    int.TryParse(Convert.ToString(key != null ? key.GetValue("CurrentBuildNumber") : "0"), out build);
            }
            catch { }
            if (build > 0 && build < 19041)
            {
                Emit("{\"type\":\"error\",\"code\":\"windows\",\"message\":\"Precisa do Windows 10 versao 2004 ou mais novo.\"}");
                return 3;
            }

            if (mode == "list")
            {
                var map = Snapshot();
                var sb = new StringBuilder("{\"type\":\"sessions\",\"items\":[");
                bool first = true;
                foreach (var pid in SessionPids())
                {
                    ProcessInfo info;
                    map.TryGetValue(pid, out info);
                    if (!first) sb.Append(',');
                    first = false;
                    sb.Append("{\"pid\":").Append(pid).Append(",\"name\":").Append(Quote(info != null ? info.Name : "?"))
                      .Append(",\"blocked\":").Append(info == null || IsBlocked(info) || TreeHasBlocked(pid, map) ? "true" : "false").Append('}');
                }
                Emit(sb.Append("]}").ToString());
                return 0;
            }

            if (mode == "app")
            {
                uint pid;
                Native.GetWindowThreadProcessId(new IntPtr(hwnd), out pid);
                var map = Snapshot();
                ProcessInfo info;
                if (pid == 0 || !map.TryGetValue(pid, out info))
                {
                    Emit("{\"type\":\"error\",\"code\":\"window\",\"message\":\"Nao achei o app dessa janela.\"}");
                    return 4;
                }
                if (IsBlocked(info) || TreeHasBlocked(pid, map))
                {
                    Emit("{\"type\":\"error\",\"code\":\"blocked\",\"message\":\"O som desse app nao pode ir junto (daria eco).\"}");
                    return 5;
                }
                StartTap(pid, CleanName(info.Name));
                lock (Gate)
                {
                    if (Taps.Count == 0)
                    {
                        Emit("{\"type\":\"error\",\"code\":\"activate\",\"message\":\"O Windows nao deixou capturar o som desse app.\"}");
                        return 6;
                    }
                }
                Report();
            }
            else if (mode == "system")
            {
                var refresher = new Thread(() =>
                {
                    while (true)
                    {
                        try { RefreshSystem(); } catch (Exception error) { Emit("{\"type\":\"warn\",\"message\":" + Quote(error.Message) + "}"); }
                        Thread.Sleep(2000);
                    }
                }) { IsBackground = true };
                refresher.SetApartmentState(ApartmentState.MTA);
                refresher.Start();
            }
            else
            {
                Emit("{\"type\":\"error\",\"code\":\"args\",\"message\":\"Use --system, --app <hwnd> ou --list.\"}");
                return 2;
            }

            Emit("{\"type\":\"ready\",\"rate\":48000,\"channels\":2,\"format\":\"s16le\"}");
            MixLoop();
            return 0;
        }
    }
}
