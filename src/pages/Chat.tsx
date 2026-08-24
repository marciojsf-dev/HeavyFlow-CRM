import React, { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { io } from "socket.io-client";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  orderBy,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, handleFirestoreError } from "../lib/firebase";
import { useAuth, UserProfile } from "../lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Send,
  Tag,
  UserPlus,
  Info,
  Paperclip,
  CheckSquare,
  Clock,
  Sidebar,
  X,
  Check,
  CheckCheck,
  Edit,
  Download,
  AlertCircle,
  Smile,
  Plus,
  Share2,
  User,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import EmojiPicker, { Theme, EmojiClickData } from "emoji-picker-react";
import { clsx } from "clsx";
import { TemplateSelectorModal } from "../components/TemplateSelectorModal";
import { ImageZoom } from "../components/ImageZoom";

import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { normalizePhone, formatPhone, getCanonicalId } from "../lib/phoneUtils";
import { storage } from "../lib/firebase";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";

export function Chat() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const outletContext: any = useOutletContext();
  const contactsCache = outletContext?.contactsCache || {};

  const [conversation, setConversation] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [contactName, setContactName] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);

  const effectiveName = useMemo(() => {
    if (
      conversation?.name &&
      conversation.name !== "Desconhecido" &&
      conversation.name !== id
    ) {
      return conversation.name;
    }
    // If it's a phone number, format it
    if (id && id.length >= 8) {
      return formatPhone(id);
    }
    return id || "Desconhecido";
  }, [conversation?.name, id]);

  const hasRealName = useMemo(() => {
    return !!(
      conversation?.name &&
      conversation.name !== "Desconhecido" &&
      conversation.name !== id &&
      !conversation.name.startsWith("55")
    );
  }, [conversation?.name, id]);

  const displayName = effectiveName;
  const displayPhone = id ? formatPhone(id) : "";
  const [teamMembers, setTeamMembers] = useState<
    (UserProfile & { id: string })[]
  >([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [customStatuses, setCustomStatuses] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [newTag, setNewTag] = useState("");
  const [newTagColor, setNewTagColor] = useState("#22c55e");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [selectedTemplateForModal, setSelectedTemplateForModal] =
    useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<any>(null);
  const [forwardContactTo, setForwardContactTo] = useState("");
  const [isForwarding, setIsForwarding] = useState(false);
  const [isSendContactModalOpen, setIsSendContactModalOpen] = useState(false);
  const [selectedErrorMsg, setSelectedErrorMsg] = useState<any>(null);
  const [sendContactData, setSendContactData] = useState({
    name: "",
    phone: "",
  });
  const [platformContacts, setPlatformContacts] = useState<any[]>([]);

  const effectiveTeamId = profile?.teamId || 'team_ivw2d5s3u';

  const fetchPlatformContacts = async () => {
    try {
      const res = await fetch(`/api/contacts?teamId=${effectiveTeamId}`);
      if (res.ok) {
        setPlatformContacts(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isSendContactModalOpen || forwardingMessage) {
      fetchPlatformContacts();
    }
  }, [isSendContactModalOpen, forwardingMessage]);

  const [forwardContactSearch, setForwardContactSearch] = useState("");
  const [sendContactSearch, setSendContactSearch] = useState("");

  const filteredForwardContacts = platformContacts
    .filter(
      (c) =>
        (c.name || "")
          .toLowerCase()
          .includes(forwardContactSearch.toLowerCase()) ||
        (c.whatsapp_id || "").includes(forwardContactSearch) ||
        (c.phone || "").includes(forwardContactSearch),
    )
    .slice(0, 15);

  const filteredSendContacts = platformContacts
    .filter(
      (c) =>
        (c.name || "")
          .toLowerCase()
          .includes(sendContactSearch.toLowerCase()) ||
        (c.whatsapp_id || "").includes(sendContactSearch) ||
        (c.phone || "").includes(sendContactSearch),
    )
    .slice(0, 15);

  const handleSendContact = async () => {
    if (!sendContactData.name || !sendContactData.phone || !id) return;

    let normalizedPhone = sendContactData.phone.replace(/\D/g, "");
    if (!normalizedPhone.startsWith("55") && normalizedPhone.length >= 10) {
      normalizedPhone = "55" + normalizedPhone;
    }

    const payload = {
      to: getCanonicalId(id),
      type: "contacts",
      teamId: profile?.teamId || "main-team",
      contacts: [
        {
          name: {
            formatted_name: sendContactData.name || "Contato",
            first_name: sendContactData.name
              ? sendContactData.name.split(" ")[0]
              : "Contato",
          },
          phones: [
            {
              phone: "+" + normalizedPhone,
              type: "CELL",
              wa_id: normalizedPhone,
            },
          ],
        },
      ],
    };

    try {
      const res = await fetch("/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setIsSendContactModalOpen(false);
        setSendContactData({ name: "", phone: "" });
        toast.success("Contato enviado com sucesso!");
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao enviar contato");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro inesperado");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 25MB.");
      return;
    }

    setIsUploading(true);
    let toastId = toast.loading("Enviando arquivo...");
    try {
      let type = "document";
      if (file.type.startsWith("image/")) type = "image";
      else if (file.type.startsWith("video/")) type = "video";
      else if (file.type.startsWith("audio/")) type = "audio";

      const formData = new FormData();
      formData.append("file", file);
      formData.append("to", id || "");
      formData.append("type", type);
      if (profile?.teamId) {
        formData.append("teamId", profile.teamId);
      }

      if (replyingTo) {
        formData.append("contextMessageId", replyingTo.whatsapp_message_id);
      }

      const sendRes = await fetch("/api/send-message-with-media", {
        method: "POST",
        body: formData,
      });

      if (!sendRes.ok) {
        const errorData = await sendRes.json();
        throw new Error(
          errorData.error || "Erro ao despachar a mensagem no Meta.",
        );
      }

      setReplyingTo(null);
      toast.success("Arquivo enviado!", { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao enviar o arquivo.", { id: toastId });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isWindowOpen = useMemo(() => {
    // Priority 1: Check database value
    const lastInboundTime = conversation?.last_received_at
      ? new Date(conversation.last_received_at).getTime()
      : 0;
    const isDbOpen =
      new Date().getTime() - lastInboundTime < 24 * 60 * 60 * 1000;

    if (isDbOpen) return true;

    // Priority 2: Check local messages (for real-time updates)
    const recentInbound = messages.some(
      (m) =>
        m.direction === "inbound" &&
        new Date().getTime() - new Date(m.timestamp).getTime() <
          24 * 60 * 60 * 1000,
    );

    return recentInbound;
  }, [conversation?.last_received_at, messages]);

  // Optionally keep it updating every minute so it auto-closes
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const interval = setInterval(() => forceUpdate({}), 30000);
    return () => clearInterval(interval);
  }, []);

  const groupedMessages = useMemo(() => {
    const groups: any[] = [];
    for (const msg of messages) {
      if (msg.type === "unsupported" || msg.type === "unknown") continue;
      const lastGroup = groups[groups.length - 1];
      if (
        lastGroup &&
        lastGroup.type === "image_group" &&
        msg.type === "image" &&
        msg.direction === lastGroup.direction
      ) {
        // Verify if it's within 1 minute of the previous message
        const timeDiff =
          new Date(msg.timestamp).getTime() -
          new Date(
            lastGroup.messages[lastGroup.messages.length - 1].timestamp,
          ).getTime();
        if (timeDiff < 60000) {
          lastGroup.messages.push(msg);
          continue;
        }
      }

      if (msg.type === "image") {
        groups.push({
          type: "image_group",
          id: msg.id,
          direction: msg.direction,
          messages: [msg],
        });
      } else {
        groups.push({ type: "single", id: msg.id, message: msg });
      }
    }
    return groups;
  }, [messages]);

  const getMediaUrl = (msg: any, isOutbound: boolean) => {
    let mediaUrl = "";
    if (msg.metadata) {
      const meta =
        typeof msg.metadata === "string"
          ? JSON.parse(msg.metadata)
          : msg.metadata;

      const type = msg.type;
      const mediaObj = meta[type];

      if (mediaObj) {
        if (mediaObj.link) {
          mediaUrl = mediaObj.link;
        } else if (mediaObj.id) {
          mediaUrl = `/api/media/${mediaObj.id}`;
        }
      } else {
        // Fallback if type doesn't match for some reason
        const fallbackObj =
          meta.image ||
          meta.video ||
          meta.audio ||
          meta.document ||
          meta.sticker;
        if (fallbackObj) {
          if (fallbackObj.link) mediaUrl = fallbackObj.link;
          else if (fallbackObj.id) mediaUrl = `/api/media/${fallbackObj.id}`;
        }
      }
    }
    if (mediaUrl && mediaUrl.startsWith('/api/media/')) {
      mediaUrl += `?teamId=${profile?.teamId || "main-team"}`;
    }
    return mediaUrl;
  };

  const downloadAllMedia = async (group: any, isOutbound: boolean) => {
    for (let i = 0; i < group.messages.length; i++) {
      const msg = group.messages[i];
      const url = getMediaUrl(msg, isOutbound);
      if (url) {
        try {
          // In iframe, direct fetching might fail due to CORS depending on how the media proxy works.
          // But since we use /api/media/..., it should be same-origin and work.
          // If cross-origin, we just open in new tab.
          if (
            url.startsWith("http") &&
            !url.startsWith(window.location.origin)
          ) {
            window.open(url, "_blank");
          } else {
            const res = await fetch(url);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = `whatsapp_image_${msg.whatsapp_message_id || msg.id || i}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
          }
        } catch (e) {
          console.error("Failed to download media:", e);
          window.open(url, "_blank");
        }
      }
    }
  };

  const statusMap: Record<string, string> = {
    open: "Aberto",
    pending: "Aguardando",
    snoozed: "Adiado",
    closed: "Resolvido",
  };

  const sendTemplate = async (
    template: any,
    variables: Record<string, string>,
  ) => {
    if (!id || !profile) return;
    const components: any[] = [];

    // header
    const headerText =
      template.components?.find((c: any) => c.type === "HEADER")?.text || "";
    const headerVars = headerText.match(/\{\{\d+\}\}/g) || [];
    if (headerVars.length > 0) {
      components.push({
        type: "header",
        parameters: headerVars.map((v: string) => ({
          type: "text",
          text: variables[v] || " ",
        })),
      });
    }

    // body
    let bodyTextRaw =
      template.components?.find((c: any) => c.type === "BODY")?.text || "";
    const bodyVarsRaw = bodyTextRaw.match(/\{\{\d+\}\}/g) || [];
    if (bodyVarsRaw.length > 0) {
      components.push({
        type: "body",
        parameters: bodyVarsRaw.map((v: string) => ({
          type: "text",
          text: variables[v] || " ",
        })),
      });
    }

    let evaluatedText =
      template.components?.find((c: any) => c.type === "BODY")?.text ||
      `[Template: ${template.name}]`;
    const varsToReplace = evaluatedText.match(/\{\{\d+\}\}/g) || [];
    varsToReplace.forEach((v) => {
      evaluatedText = evaluatedText.replace(v, variables[v] || " ");
    });

    try {
      const canonical = getCanonicalId(id || "");
      const templatePayload: any = {
        name: template.name,
        language: { code: template.language || "pt_BR" },
      };
      if (components.length > 0) {
        templatePayload.components = components;
      }

      const res = await fetch("/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: canonical,
          type: "template",
          templateText: evaluatedText,
          teamId: profile?.teamId,
          template: templatePayload,
        }),
      });

      const data = await res.json();
      console.log(">>> [CHAT DEBUG] Template send response:", data);

      if (!data.success) {
        const errorMsg = data.details?.error?.message || data.error?.message || data.error || "Erro ao enviar modelo pela Meta";
        throw new Error(errorMsg);
      }

      toast.success("Modelo enviado com sucesso!");

      // Optimistic update if we have message data back
      if (data.data?.messages?.[0]?.id) {
        const newMsgId = data.data.messages[0].id;
        console.log(">>> [CHAT DEBUG] Optimistic ID (Template):", newMsgId);
        const optimisticMsg = {
          id: newMsgId,
          whatsapp_message_id: newMsgId,
          contact_whatsapp_id: canonical,
          content: evaluatedText,
          type: "template",
          direction: "outbound",
          status: "sent",
          timestamp: new Date(),
          metadata: {
            template: {
              name: template.name,
              language: { code: template.language || "pt_BR" },
            },
          },
        };
        setMessages((prev) => {
          const exists = prev.some((m) => m.whatsapp_message_id === newMsgId);
          if (exists) return prev;
          return [...prev, optimisticMsg]
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
            .slice(-100);
        });
        setTimeout(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      }

      // Refresh messages
      try {
        const msgRes = await fetch(
          `/api/messages?contactId=${canonical}&teamId=${profile?.teamId}`,
        );
        const contentType = msgRes.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const msgData = await msgRes.json();
          setMessages((prev) => {
            const newBatch = msgData.map((m: any) => ({
              ...m,
              timestamp: new Date(m.timestamp),
            }));
            const existingIds = prev.map((m) => m.whatsapp_message_id);

            const updatedPrev = prev.map((m) => {
              const updatedM = newBatch.find(
                (b: any) => b.whatsapp_message_id === m.whatsapp_message_id,
              );
              if (updatedM) {
                return {
                  ...m,
                  ...updatedM,
                  timestamp: new Date(updatedM.timestamp),
                };
              }
              return m;
            });

            const newBatchIds = new Set(
              newBatch.map((m: any) => m.whatsapp_message_id),
            );
            const toAdd = newBatch.filter(
              (m: any) => !existingIds.includes(m.whatsapp_message_id),
            );

            return [...updatedPrev, ...toAdd]
              .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
              .slice(-100);
          });
          setTimeout(() => {
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: "smooth",
            });
          }, 100);
        }
      } catch (e) {
        console.warn("Failed to implicitly refresh messages", e);
      }
    } catch (err: any) {
      console.error("Error sending template", err);
      toast.error("Erro ao enviar modelo: " + err.message);
    }
  };

  const changeStatus = async (status: string) => {
    try {
      await fetch("/api/conversations/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: id,
          status,
          teamId: profile?.teamId,
        }),
      });
      setConversation((prev: any) => ({ ...prev, status }));
    } catch (err: any) {
      console.error(err);
    }
  };

  const changeAgent = async (agentId: string) => {
    try {
      await fetch("/api/conversations/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: id,
          agentId: agentId === "none" ? "" : agentId,
          teamId: profile?.teamId,
        }),
      });
      setConversation((prev: any) => ({ ...prev, agent_id: agentId }));
    } catch (err: any) {
      console.error(err);
    }
  };

  const changeDepartment = async (departmentId: string) => {
    try {
      await fetch("/api/conversations/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: id,
          departmentId: departmentId === "none" ? "" : departmentId,
          teamId: profile?.teamId,
        }),
      });
      setConversation((prev: any) => ({ ...prev, department_id: departmentId }));
    } catch (err: any) {
      console.error(err);
    }
  };

  const scrollToMessage = (whatsappMessageId: string) => {
    const element = document.getElementById(`msg-${whatsappMessageId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      // Professional highlight effect: flash border and background shadow
      element.classList.add(
        "ring-4",
        "ring-emerald-400",
        "ring-opacity-80",
        "z-50",
        "bg-emerald-50/50",
        "transition-all",
        "duration-300",
      );
      setTimeout(() => {
        element.classList.remove(
          "ring-4",
          "ring-emerald-400",
          "ring-opacity-80",
          "bg-emerald-50/50",
        );
        setTimeout(() => element.classList.remove("z-50"), 500);
      }, 1500);
    }
  };

  const [contactForm, setContactForm] = useState({ name: "", email: "" });

  useEffect(() => {
    if (conversation) {
      setContactForm({
        name:
          conversation.name &&
          conversation.name !== "Desconhecido" &&
          !conversation.name.startsWith("55")
            ? conversation.name
            : "",
        email: conversation.email || "",
      });
    }
  }, [conversation]);

  const updateContactInfo = async () => {
    if (!contactForm.name.trim() || !id) {
      toast.error("O nome é obrigatório.");
      return;
    }
    try {
      const res = await fetch("/api/contacts/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsappId: id,
          name: contactForm.name,
          email: contactForm.email,
        }),
      });
      if (res.ok) {
        toast.success("Informações do contato atualizadas!");
        setIsEditingName(false);
        setConversation((prev: any) => ({
          ...prev,
          name: contactForm.name,
          email: contactForm.email,
        }));
      }
    } catch (err) {
      toast.error("Erro ao salvar contato.");
    }
  };

  useEffect(() => {
    if (!profile?.teamId) return;

    const fetchTeamMembers = async () => {
      try {
        const q = query(
          collection(db, "users"),
          where("teamId", "==", profile.teamId)
        );
        const snapshot = await getDocs(q);
        const data: any[] = [];
        snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() }));
        setTeamMembers(data);
      } catch (err) {
        console.warn("Failed to load team members:", err);
      }
    };

    const fetchDepartments = async () => {
      try {
        const q = query(collection(db, 'departments'), where('teamId', '==', profile.teamId));
        const snapshot = await getDocs(q);
        const data: any[] = [];
        snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        setDepartments(data);
      } catch (err) {
        console.warn("Failed to load departments:", err);
      }
    };

    fetchTeamMembers();
    fetchDepartments();
  }, [profile?.teamId]);

  useEffect(() => {
    if (!id) return;

    // Fetch Templates & Statuses
    const fetchMetadataDependencies = async () => {
      try {
        const tReq = await fetch(`/api/templates?teamId=${effectiveTeamId}`);
        const tContentType = tReq.headers.get("content-type");
        if (tContentType && tContentType.indexOf("application/json") !== -1) {
          const tData = await tReq.json();
          setTemplates(tData);
        }

        const sReq = await fetch(
          `/api/custom-statuses?teamId=${effectiveTeamId}`,
        );
        const sContentType = sReq.headers.get("content-type");
        if (sContentType && sContentType.indexOf("application/json") !== -1) {
          const sData = await sReq.json();
          setCustomStatuses(sData);
        }
      } catch (err) {
        console.warn("Metadata fetch warning:", err);
      }
    };
    fetchMetadataDependencies();

    // Clear unread count when opening chat
    fetch("/api/contacts/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatsappId: getCanonicalId(id) }),
    }).catch(console.error);

    // Clear state before fetching new contact data to prevent flash of old messages
    setMessages([]);
    setConversation(null);
    setReplyingTo(null);

    // Fetch Conversation Details from PG
    const fetchConversation = async () => {
      try {
        const res = await fetch(
          `/api/conversations/${id}?teamId=${effectiveTeamId}`,
        );
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const data = await res.json();
          setConversation(data);
        } else {
          // Not found or rate limited, fallback minimally
          if (!conversation)
            setConversation({
              id,
              status: "open",
              tags: [],
              agent_id: "",
              whatsapp_id: id,
            });
        }
      } catch (err) {
        console.warn("Conversation fetch warning:", err);
      }
    };
    fetchConversation();

    // Fetch Messages from PostgreSQL API
    const fetchMessages = async () => {
      try {
        const canonicalId = getCanonicalId(id || "");
        console.log(
          `>>> [CHAT DEBUG] Buscando mensagens para ID: ${id} (Canonical: ${canonicalId}), Team: ${effectiveTeamId}`,
        );
        const res = await fetch(
          `/api/messages?contactId=${canonicalId}&teamId=${effectiveTeamId}`,
        );
        const contentType = res.headers.get("content-type");
        if (!contentType || contentType.indexOf("application/json") === -1) {
          const text = await res.text();
          console.error(
            ">>> [CHAT DEBUG] Erro na resposta de mensagens (não é JSON):",
            text,
          );
          return;
        }
        const data = await res.json();
        console.log(`>>> [CHAT DEBUG] ${data.length} mensagens encontradas.`);
        setMessages((prev) => {
          const newBatch = data.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }));
          const newBatchIds = new Set(
            newBatch.map((m: any) => m.whatsapp_message_id),
          );
          const missingFromNew = prev.filter(
            (m) =>
              !newBatchIds.has(m.whatsapp_message_id) &&
              m.contact_whatsapp_id &&
              getCanonicalId(m.contact_whatsapp_id) === canonicalId,
          );
          return [...newBatch, ...missingFromNew]
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
            .slice(-100);
        });

        setTimeout(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      } catch (err) {
        console.error(">>> [CHAT DEBUG] Erro ao buscar mensagens:", err);
      }
    };

    fetchMessages();

    // Listen for new messages via Socket.io
    const socket = io();

    socket.on("connect", () => {
      console.log(">>> [CHAT SOCKET] Conectado! Time:", effectiveTeamId);
      socket.emit("join", effectiveTeamId);
      socket.emit("join_team", effectiveTeamId);
    });

    socket.on("whatsapp:message_received", (data) => {
      console.log(">>> [CHAT DEBUG] Mensagem Recebida via Socket:", data);

      // Handle both Meta API structure and internal DB structure
      const rawFrom =
        data.message?.contact_whatsapp_id ||
        data.message?.from ||
        data.whatsapp_id ||
        "";
      const from = rawFrom.replace(/\D/g, "");
      const currentId = (id || "").replace(/\D/g, "");

      console.log(
        `>>> [CHAT DEBUG] Mensagem Recebida via Socket: "${from}" contra "${currentId}"`,
      );

      const isMatch =
        from &&
        (from === currentId ||
          (from.length > 8 && currentId.includes(from)) ||
          (currentId.length > 8 && from.includes(currentId)));

      if (isMatch) {
        console.log(
          ">>> [CHAT DEBUG] Correspondência encontrada! Atualizando tela.",
        );

        if (data.message && data.message.whatsapp_message_id) {
          const newMsg = {
            ...data.message,
            timestamp: new Date(data.message.timestamp || Date.now()),
          };

          setMessages((prev) => {
            const filtered = prev.filter(
              (m) => m.whatsapp_message_id !== newMsg.whatsapp_message_id,
            );
            return [...filtered, newMsg].sort(
              (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
            );
          });
        }

        // Force a state update for conversation metadata ONLY if inbound
        if (data.message?.direction === "inbound") {
          setConversation((prev: any) =>
            prev
              ? { ...prev, last_received_at: new Date().toISOString() }
              : prev,
          );
        }

        // Clear unread count since we are already viewing it
        fetch("/api/contacts/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ whatsappId: currentId }),
        }).catch(console.error);
      } else {
        console.log(
          ">>> [CHAT DEBUG] ID não corresponde ou está vazio. Ignorando atualização de tela.",
        );
      }
    });

    socket.on("whatsapp:message_status", (data) => {
      console.log(">>> [CHAT SOCKET] Status Update:", data);
      const recipient = (data.recipient_id || "").replace(/\D/g, "");
      const currentId = (id || "").replace(/\D/g, "");

      // Normalização agressiva para match de contato (com ou sem 9)
      const isCurrentChat =
        recipient === currentId ||
        (recipient.length > 8 && currentId.includes(recipient)) ||
        (currentId.length > 8 && recipient.includes(currentId));

      setMessages((prev) => {
        const exists = prev.some(
          (m) => m.whatsapp_message_id === data.messageId,
        );
        if (!exists && isCurrentChat) {
          // Se a mensagem não existe no state mas é deste chat, forçamos um fetch rápido
          setTimeout(fetchMessages, 500);
          return prev;
        }

        return prev.map((m) => {
          if (m.whatsapp_message_id === data.messageId) {
            const statusPriority: Record<string, number> = {
              sent: 1,
              delivered: 2,
              read: 3,
              failed: 4,
            };
            const currentPrio = statusPriority[m.status?.toLowerCase()] || 0;
            const nextPrio = statusPriority[data.status?.toLowerCase()] || 0;

            // Se for 'failed', sempre sobrepõe. Se não, segue a prioridade normal.
            if (data.status === "failed" || nextPrio >= currentPrio) {
              return {
                ...m,
                status: data.status.toLowerCase(),
                error_details: data.error_details || null,
              };
            }
          }
          return m;
        });
      });

      if (isCurrentChat) {
        // Sincronização rápida para garantir que componentes reajam
        // Removido para estabilidade do tempo real
        // setTimeout(fetchMessages, 1000);
      }
    });

    socket.on("whatsapp:message_reaction", (data) => {
      console.log(">>> [CHAT SOCKET] Reação:", data);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.whatsapp_message_id === data.messageId) {
            return { ...m, reactions: data.reactions };
          }
          return m;
        }),
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [id, profile]);

  // Removed old checkWindow effect

  const reactToMessage = async (msg: any, emoji: string) => {
    try {
      const canonical = getCanonicalId(id || "");
      const res = await fetch("/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: canonical,
          type: "reaction",
          text: emoji,
          contextMessageId: msg.whatsapp_message_id,
          teamId: profile?.teamId,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error("Erro ao reagir à mensagem");
      }
    } catch (err) {
      console.error("Reaction Error:", err);
      toast.error("Erro ao enviar reação");
    }
  };

  const handleForwardMessage = async () => {
    if (!forwardingMessage || !forwardContactTo) return;
    setIsForwarding(true);
    let normalizedPhone = forwardContactTo.replace(/\D/g, "");
    if (!normalizedPhone.startsWith("55") && normalizedPhone.length >= 10) {
      normalizedPhone = "55" + normalizedPhone;
    }

    let contentToSend = forwardingMessage.content;
    if (forwardingMessage.type === "document" && !contentToSend)
      contentToSend = "";

    let payloadMessage = `Encaminhado:\n\n${contentToSend || `[${forwardingMessage.type}]`}`;
    let payload: any = {
      to: normalizedPhone,
      type: "text",
      text: payloadMessage,
      teamId: profile?.teamId || "main-team",
    };
    if (["image", "video", "audio", "document", "sticker"].includes(forwardingMessage.type) && forwardingMessage.metadata) {
       payload.type = forwardingMessage.type;
       delete payload.text;
       let parsedMeta = typeof forwardingMessage.metadata === "string" ? JSON.parse(forwardingMessage.metadata) : forwardingMessage.metadata;
       const mediaData = parsedMeta[forwardingMessage.type] || parsedMeta.image || parsedMeta.video || parsedMeta.audio || parsedMeta.document || parsedMeta.sticker;
       if (mediaData?.id) payload.mediaId = mediaData.id;
       else if (mediaData?.link) payload.link = mediaData.link;
       if (forwardingMessage.type === "document" && mediaData?.filename) payload.filename = mediaData.filename;
    }

    try {
      const res = await fetch("/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Mensagem encaminhada com sucesso!");
        setForwardingMessage(null);
        setForwardContactTo("");
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao encaminhar mensagem");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro inesperado ao encaminhar");
    } finally {
      setIsForwarding(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !id) return;

    const textToSend = newMessage;
    setNewMessage("");

    try {
      const canonical = getCanonicalId(id || "");
      const bodyPayload: any = {
        to: canonical,
        type: "text",
        text: textToSend,
        teamId: profile?.teamId || "main-team",
      };
      if (replyingTo) {
        bodyPayload.contextMessageId = replyingTo.whatsapp_message_id;
      }

      const res = await fetch("/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      console.log(">>> [CHAT DEBUG] /api/send-message response:", data);

      if (!data.success) {
        throw new Error(data.error?.message || data.error || "Erro na Meta");
      }

      // Optimistic update if we have message data back
      if (data.data?.messages?.[0]?.id) {
        const newMsgId = data.data.messages[0].id;
        console.log(">>> [CHAT DEBUG] Optimistic ID:", newMsgId);
        const optimisticMsg = {
          id: newMsgId, // Ensure id is present for React key
          whatsapp_message_id: newMsgId,
          contact_whatsapp_id: canonical,
          content: textToSend,
          type: "text",
          direction: "outbound",
          status: "sent",
          timestamp: new Date(),
        };
        setMessages((prev) => {
          const exists = prev.some((m) => m.whatsapp_message_id === newMsgId);
          if (exists) return prev;
          return [...prev, optimisticMsg]
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
            .slice(-100);
        });
        setTimeout(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      }

      setReplyingTo(null);

      // Refresh messages immediately to ensure local sync
      // Use the same canonical ID for fetching
      const msgRes = await fetch(
        `/api/messages?contactId=${canonical}&teamId=${profile?.teamId}`,
      );
      const contentType = msgRes.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const msgData = await msgRes.json();
        setMessages((prev) => {
          // Merging is safer than replacing
          const newBatch = msgData.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }));
          const existingIds = prev.map((m) => m.whatsapp_message_id);

          // Update any existing messages with the new batch (for status updates)
          const updatedPrev = prev.map((m) => {
            const updatedM = newBatch.find(
              (b: any) => b.whatsapp_message_id === m.whatsapp_message_id,
            );
            if (updatedM) {
              return {
                ...m,
                ...updatedM,
                timestamp: new Date(updatedM.timestamp),
              };
            }
            return m;
          });

          const newBatchIds = new Set(
            newBatch.map((m: any) => m.whatsapp_message_id),
          );
          const toAdd = newBatch.filter(
            (m: any) => !existingIds.includes(m.whatsapp_message_id),
          );

          return [...updatedPrev, ...toAdd]
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
            .slice(-100);
        });
        setTimeout(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao enviar mensagem: " + err.message);
    }
  };

  const addTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim() || !conversation) return;

    const currentTags = conversation.tags || [];
    const tagWithColor = `${newTag.trim()}::${newTagColor}`;
    if (!currentTags.some((t: string) => t.split("::")[0] === newTag.trim())) {
      try {
        const updatedTags = [...currentTags, tagWithColor];
        await fetch("/api/conversations/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: id,
            tags: updatedTags,
            teamId: profile?.teamId,
          }),
        });
        setConversation((prev: any) => ({ ...prev, tags: updatedTags }));
        setNewTag("");
      } catch (err: any) {
        console.error(err);
      }
    } else {
      toast.error("Tag já adicionada.");
    }
  };

  const removeTag = async (tagToRemove: string) => {
    if (!conversation) return;
    const currentTags = conversation.tags || [];
    try {
      const updatedTags = currentTags.filter((t: string) => t !== tagToRemove);
      await fetch("/api/conversations/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: id,
          tags: updatedTags,
          teamId: profile?.teamId,
        }),
      });
      setConversation((prev: any) => ({ ...prev, tags: updatedTags }));
    } catch (err: any) {
      console.error(err);
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior,
      });
    }
  };

  useEffect(() => {
    scrollToBottom("auto");
  }, [messages.length]);

  if (!conversation)
    return (
      <div className="p-8 font-medium text-zinc-500">Caregando conversa...</div>
    );

  return (
    <div className="flex h-full bg-slate-50 relative overflow-hidden">
      <TemplateSelectorModal
        isOpen={isTemplateModalOpen}
        onClose={() => {
          setIsTemplateModalOpen(false);
          setSelectedTemplateForModal(null);
        }}
        templates={templates}
        contactName={displayName}
        onSend={sendTemplate}
        initialTemplate={selectedTemplateForModal}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col items-stretch overflow-hidden">
        {/* Chat Header */}
        <div className="h-16 pl-14 pr-6 border-b flex items-center justify-between bg-white z-10 shrink-0 shadow-sm relative">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/inbox")}
              className="md:hidden"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold uppercase shadow-inner overflow-hidden">
                {conversation?.profile_picture_url ? (
                  <img
                    src={conversation.profile_picture_url}
                    alt={effectiveName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  effectiveName.charAt(0)
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  {isEditingName ? (
                    <div className="flex flex-col gap-2 bg-zinc-50 p-3 rounded-lg border border-zinc-200 shadow-sm z-50 absolute top-16 left-14">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-zinc-500">
                          Telefone
                        </label>
                        <Input
                          value={displayPhone}
                          disabled
                          className="h-8 text-sm w-48 bg-zinc-100 text-zinc-500 font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-zinc-500">
                          Nome do Contato
                        </label>
                        <Input
                          value={contactForm.name}
                          onChange={(e) =>
                            setContactForm((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          className="h-8 text-sm w-48"
                          placeholder="Nome Completo"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-zinc-500">
                          E-mail
                        </label>
                        <Input
                          value={contactForm.email}
                          onChange={(e) =>
                            setContactForm((prev) => ({
                              ...prev,
                              email: e.target.value,
                            }))
                          }
                          className="h-8 text-sm w-48"
                          placeholder="joao@exemplo.com"
                        />
                      </div>
                      <div className="flex justify-end gap-2 mt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setIsEditingName(false)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          disabled={!contactForm.name.trim()}
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                          onClick={updateContactInfo}
                        >
                          Salvar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-zinc-900 leading-tight">
                        {effectiveName}
                      </h2>
                      {!hasRealName ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[10px] uppercase font-bold border-emerald-600 text-emerald-600 hover:bg-emerald-50"
                          onClick={() => {
                            setContactForm({
                              name:
                                conversation.name &&
                                conversation.name !== "Desconhecido" &&
                                !conversation.name.startsWith("55")
                                  ? conversation.name
                                  : "",
                              email: conversation.email || "",
                            });
                            setIsEditingName(true);
                          }}
                        >
                          <UserPlus className="w-3 h-3 mr-1" />
                          Salvar Contato
                        </Button>
                      ) : (
                        <button
                          onClick={() => {
                            setContactForm({
                              name:
                                conversation.name &&
                                conversation.name !== "Desconhecido" &&
                                !conversation.name.startsWith("55")
                                  ? conversation.name
                                  : "",
                              email: conversation.email || "",
                            });
                            setIsEditingName(true);
                          }}
                          className="text-zinc-400 hover:text-zinc-600"
                          title="Editar Contato"
                        >
                          <Edit className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {hasRealName && (
                  <p className="text-[10px] text-zinc-500 font-mono">
                    {displayPhone}
                  </p>
                )}
                {!hasRealName && (
                  <p className="text-[10px] text-zinc-500 font-mono tracking-wider">
                    Novo Contato (Clique em Salvar)
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Select
              value={String(conversation.status)}
              onValueChange={changeStatus}
            >
              <SelectTrigger className="w-[180px]">
                <span className="flex flex-1 text-left truncate">
                  {conversation.status === "open"
                    ? "Aberto"
                    : conversation.status === "pending"
                      ? "Aguardando Cliente"
                      : conversation.status === "snoozed"
                        ? "Adiado"
                        : conversation.status === "closed"
                          ? "Resolvido"
                          : customStatuses.find(
                              (s) =>
                                String(s.id) === String(conversation.status),
                            )?.name ||
                            conversation.status ||
                            "Alterar Status"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Aberto</SelectItem>
                <SelectItem value="pending">Aguardando Cliente</SelectItem>
                <SelectItem value="snoozed">Adiado</SelectItem>
                <SelectItem value="closed">Resolvido</SelectItem>
                {customStatuses.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              className={clsx(
                "transition-colors",
                isDetailsOpen ? "bg-zinc-100 text-zinc-900" : "text-zinc-500",
              )}
              onClick={() => setIsDetailsOpen(!isDetailsOpen)}
              title="Alternar Detalhes"
            >
              <Sidebar className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Messages List Area */}
        {/* Background inspired by WhatsApp Web */}
        <div
          className="flex-1 p-6 relative bg-[#efeae2] overflow-y-auto scroll-smooth"
          ref={scrollRef}
          style={{
            backgroundImage:
              'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
            backgroundOpacity: 0.05,
          }}
        >
          <div className="space-y-4 max-w-4xl mx-auto w-full pb-4">
            {groupedMessages.map((group) => {
              const direction = group.direction || group.message?.direction;
              const isOutbound = direction === "outbound";

              if (group.type === "image_group") {
                const lastMsg = group.messages[group.messages.length - 1];
                let relatedMessageContent = "";
                let relatedSender = "";
                let contextId = "";
                if (lastMsg.metadata) {
                  const parsedMeta =
                    typeof lastMsg.metadata === "string"
                      ? JSON.parse(lastMsg.metadata)
                      : lastMsg.metadata;
                  contextId =
                    parsedMeta.context?.id || parsedMeta.context?.message_id;
                  if (contextId) {
                    const relatedMsg = messages.find(
                      (m: any) => m.whatsapp_message_id === contextId,
                    );
                    if (relatedMsg) {
                      relatedSender =
                        relatedMsg.direction === "outbound"
                          ? "Você"
                          : conversation?.name || "Contato";
                      relatedMessageContent =
                        relatedMsg.content ||
                        (relatedMsg.type !== "text"
                          ? `[${relatedMsg.type}]`
                          : "Mensagem");
                    } else {
                      relatedMessageContent = "Mensagem anterior";
                    }
                  }
                }

                return (
                  <div
                    key={group.id}
                    id={`msg-${lastMsg.whatsapp_message_id}`}
                    className={`flex ${isOutbound ? "justify-end" : "justify-start"} group/row`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg p-1.5 shadow-sm relative ${isOutbound ? "bg-[#d9fdd3] rounded-tr-none" : "bg-white rounded-tl-none border border-zinc-200/50"}`}
                    >
                      {relatedMessageContent && (
                        <div
                          className="bg-black/5 border-l-4 border-emerald-500 p-2 py-1 mb-2 rounded-r text-[11px] cursor-pointer hover:bg-black/10 transition-colors overflow-hidden"
                          onClick={() =>
                            contextId && scrollToMessage(contextId)
                          }
                          title="Clique para ir à mensagem original"
                        >
                          {relatedSender && (
                            <div className="font-bold text-emerald-600 mb-0.5 truncate">
                              {relatedSender}
                            </div>
                          )}
                          <div className="text-zinc-600 line-clamp-2 truncate">
                            {relatedMessageContent}
                          </div>
                        </div>
                      )}
                      <div
                        className={`grid gap-1 ${group.messages.length > 1 ? (group.messages.length % 2 === 0 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3") : "grid-cols-1"}`}
                      >
                        {group.messages.map((msg: any) => {
                          const mediaUrl = getMediaUrl(msg, isOutbound);
                          return (
                            <div
                              key={msg.id}
                              id={`msg-${msg.whatsapp_message_id}`}
                              className="relative group/img flex flex-col"
                            >
                              <div className="relative aspect-square overflow-hidden rounded">
                                <ImageZoom
                                  src={mediaUrl}
                                  className="w-full h-full"
                                />
                                <a
                                  href={mediaUrl}
                                  download={`whatsapp_image_${msg.id}.jpg`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 opacity-0 group-hover/img:opacity-100 transition-opacity"
                                  title="Baixar Imagem"
                                >
                                  <Paperclip className="w-4 h-4" />
                                </a>
                              </div>
                              {msg.content && (
                                <p className="text-sm whitespace-pre-wrap leading-relaxed text-zinc-800 mt-1.5 px-0.5">
                                  {msg.content}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div
                        className={`flex items-center justify-end gap-1 mt-1 px-1 ${isOutbound ? "text-zinc-500" : "text-zinc-400"}`}
                      >
                        <span className="text-[9px]">
                          {lastMsg.timestamp
                            ? format(new Date(lastMsg.timestamp), "HH:mm")
                            : "--:--"}
                        </span>
                        {isOutbound && (
                          <div className="flex ml-0.5">
                            {lastMsg.status === "read" ? (
                              <CheckCheck
                                className="w-3.5 h-3.5 text-[#3b82f6]"
                                strokeWidth={2.5}
                              />
                            ) : lastMsg.status === "delivered" ? (
                              <CheckCheck
                                className="w-3.5 h-3.5 text-zinc-500"
                                strokeWidth={2.5}
                              />
                            ) : lastMsg.status === "sent" ||
                              lastMsg.status === "accepted" ? (
                              <Check
                                className="w-3.5 h-3.5 text-zinc-500"
                                strokeWidth={2.5}
                              />
                            ) : lastMsg.status === "failed" ? (
                              <AlertCircle
                                className="w-3.5 h-3.5 text-red-500"
                                title={(() => {
                                  try {
                                    if (!lastMsg.error_details)
                                      return "Falha ao enviar";
                                    const errs =
                                      typeof lastMsg.error_details === "string"
                                        ? JSON.parse(lastMsg.error_details)
                                        : lastMsg.error_details;
                                    if (
                                      Array.isArray(errs) &&
                                      errs.length > 0
                                    ) {
                                      return errs
                                        .map(
                                          (e: any) =>
                                            e.title || e.message || e.code,
                                        )
                                        .join(" | ");
                                    }
                                    return typeof lastMsg.error_details ===
                                      "string"
                                      ? lastMsg.error_details
                                      : JSON.stringify(lastMsg.error_details);
                                  } catch (e) {
                                    return String(lastMsg.error_details);
                                  }
                                })()}
                              />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-zinc-400" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div
                      className={`opacity-0 group-hover/row:opacity-100 transition-opacity self-center px-2 flex flex-col gap-1 ${isOutbound ? "-order-1" : ""}`}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-zinc-400 hover:text-zinc-600"
                        onClick={() => setReplyingTo(lastMsg)}
                        title="Responder"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 17 4 12 9 7"></polyline>
                          <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
                        </svg>
                      </Button>
                      {group.messages.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-zinc-400 hover:text-zinc-600"
                          onClick={() => downloadAllMedia(group, isOutbound)}
                          title="Baixar todas as imagens"
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              }

              // Single Message rendering
              const msg = group.message;
              const mediaUrl = getMediaUrl(msg, isOutbound);
              let relatedMessageContent = "";
              let relatedSender = "";
              let parsedMeta: any = null;
              let fullTemplateToRender: any = null;

              if (msg.metadata) {
                parsedMeta =
                  typeof msg.metadata === "string"
                    ? JSON.parse(msg.metadata)
                    : msg.metadata;
                // Support context messages
                const contextId =
                  parsedMeta.context?.id || parsedMeta.context?.message_id;
                if (contextId) {
                  const relatedMsg = messages.find(
                    (m: any) => m.whatsapp_message_id === contextId,
                  );
                  if (relatedMsg) {
                    relatedSender =
                      relatedMsg.direction === "outbound"
                        ? "Você"
                        : conversation?.name || "Contato";
                    relatedMessageContent =
                      relatedMsg.content ||
                      (relatedMsg.type !== "text"
                        ? `[${relatedMsg.type}]`
                        : "Mensagem");
                  } else {
                    relatedMessageContent = "Mensagem anterior"; // Placeholder if not loaded
                  }
                }

                if (msg.type === "template" && parsedMeta?.template) {
                  const tData = parsedMeta.template;
                  const tDataLang = tData.language?.code || tData.language;
                  const matched = templates.find(
                    (t) =>
                      t.name === tData.name &&
                      (!tDataLang || t.language === tDataLang),
                  );
                  if (matched) {
                    // Merge text values
                    fullTemplateToRender = { ...matched };
                    // We have to recreate the text if needed, but matched.components is already an array of complete components
                    // The `templateText` variable logic we used is in msg.content.
                    // Actually, we can just use `msg.content` for the body if there are variables! So we just render header and footer/buttons.
                  }
                }
              }

              return (
                <div
                  key={msg.id}
                  id={`msg-${msg.whatsapp_message_id}`}
                  className={`flex ${isOutbound ? "justify-end" : "justify-start"} group`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg px-3 py-1.5 shadow-sm relative ${isOutbound ? "bg-[#d9fdd3] rounded-tr-none" : "bg-white rounded-tl-none border border-zinc-200/50"}`}
                  >
                    {relatedMessageContent && (
                      <div
                        className="bg-black/5 border-l-4 border-emerald-500 p-2 py-1 mb-2 rounded-r text-[11px] cursor-pointer hover:bg-black/10 transition-colors overflow-hidden"
                        onClick={() => {
                          const cid =
                            parsedMeta?.context?.id ||
                            parsedMeta?.context?.message_id;
                          if (cid) scrollToMessage(cid);
                        }}
                        title="Clique para ir à mensagem original"
                      >
                        {relatedSender && (
                          <div className="font-bold text-emerald-600 mb-0.5 truncate">
                            {relatedSender}
                          </div>
                        )}
                        <div className="text-zinc-600 line-clamp-2 truncate">
                          {relatedMessageContent}
                        </div>
                      </div>
                    )}
                    {msg.type === "video" && mediaUrl && (
                      <video
                        src={mediaUrl}
                        controls
                        className="max-w-full rounded mb-2 max-h-64"
                      />
                    )}
                    {msg.type === "audio" && mediaUrl && (
                      <audio
                        src={mediaUrl}
                        controls
                        className="max-w-full mb-2"
                      />
                    )}
                    {msg.type === "document" && mediaUrl && (
                      <a
                        href={mediaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center p-2 bg-zinc-100 rounded mb-2 text-sm text-blue-600 hover:underline"
                      >
                        <Paperclip className="w-4 h-4 mr-2" /> Baixar Documento
                      </a>
                    )}
                    {msg.type === "sticker" && mediaUrl && (
                      <img
                        src={mediaUrl}
                        alt="Sticker"
                        className="w-32 h-32 object-contain drop-shadow-sm mb-2"
                      />
                    )}
                    {msg.type === "contacts" &&
                      parsedMeta?.contacts &&
                      parsedMeta.contacts.length > 0 && (
                        <div className="flex flex-col gap-2 min-w-[200px] my-1">
                          <div className="flex items-center gap-3 pb-2 border-b border-zinc-200/50">
                            <div className="w-10 h-10 bg-zinc-200 rounded-full flex items-center justify-center shrink-0">
                              <User className="w-5 h-5 text-zinc-500" />
                            </div>
                            <div className="flex flex-col overflow-hidden">
                              <span className="font-bold text-sm text-zinc-900 truncate">
                                {parsedMeta.contacts[0].name?.formatted_name ||
                                  "Contato"}
                              </span>
                              <span className="text-xs text-zinc-500 font-mono">
                                {formatPhone(
                                  parsedMeta.contacts[0].phones?.[0]?.wa_id ||
                                    parsedMeta.contacts[0].phones?.[0]?.phone ||
                                    "",
                                )}
                              </span>
                            </div>
                          </div>
                          {(parsedMeta.contacts[0].phones?.[0]?.wa_id ||
                            parsedMeta.contacts[0].phones?.[0]?.phone) && (
                            <a
                              href={`/inbox?contactId=${(parsedMeta.contacts[0].phones?.[0]?.wa_id || parsedMeta.contacts[0].phones?.[0]?.phone).replace(/\D/g, "")}`}
                              className="text-[#00a884] text-sm font-semibold text-center hover:underline py-1 w-full block"
                            >
                              Conversar
                            </a>
                          )}
                        </div>
                      )}
                    {msg.type === "template" && fullTemplateToRender && (
                      <div className="flex flex-col gap-1 my-1">
                        {(() => {
                          const header = fullTemplateToRender.components?.find(
                            (c: any) => c.type === "HEADER",
                          );
                          const footer = fullTemplateToRender.components?.find(
                            (c: any) => c.type === "FOOTER",
                          );
                          const buttons = fullTemplateToRender.components?.find(
                            (c: any) => c.type === "BUTTONS",
                          );
                          return (
                            <>
                              {header && (
                                <div className="font-bold text-[15px] mb-1 text-zinc-900">
                                  {header.format === "IMAGE"
                                    ? "📷 [Imagem anexada]"
                                    : header.format === "VIDEO"
                                      ? "🎥 [Vídeo anexado]"
                                      : header.format === "DOCUMENT"
                                        ? "📄 [Documento anexado]"
                                        : header.text || "[Cabeçalho]"}
                                </div>
                              )}
                              <p className="text-[14px] whitespace-pre-wrap leading-relaxed text-zinc-800">
                                {msg.content}
                              </p>
                              {footer && footer.text && (
                                <div className="text-[13px] text-zinc-500 mt-1">
                                  {footer.text}
                                </div>
                              )}
                              {buttons && buttons.buttons?.length > 0 && (
                                <div className="mt-2 flex flex-col gap-1 border-t border-zinc-200/50 pt-2 pb-1 bg-zinc-50/50 -mx-3 px-3">
                                  {buttons.buttons.map((b: any, i: number) => (
                                    <div
                                      key={i}
                                      className="text-[#00a884] text-[14px] bg-white border border-zinc-200 shadow-sm font-semibold flex items-center justify-center py-2 rounded-lg select-none"
                                    >
                                      {b.text}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {msg.content &&
                      msg.content !== "[Sticker]" &&
                      msg.type !== "contacts" &&
                      (!fullTemplateToRender || msg.type !== "template") && (
                        <p className="text-[14.5px] whitespace-pre-wrap leading-relaxed text-zinc-900">
                          {msg.content}
                        </p>
                      )}
                    <div
                      className={`flex items-center justify-end gap-1 mt-1 ${isOutbound ? "text-emerald-700/70" : "text-zinc-400"}`}
                    >
                      <span className="text-[9px]">
                        {msg.timestamp
                          ? format(new Date(msg.timestamp), "HH:mm")
                          : "--:--"}
                      </span>
                      {isOutbound && (
                        <div className="flex ml-0.5">
                          {msg.status === "read" ? (
                            <CheckCheck
                              className="w-3.5 h-3.5 text-[#3b82f6]"
                              strokeWidth={2.5}
                            />
                          ) : msg.status === "delivered" ? (
                            <CheckCheck
                              className="w-3.5 h-3.5 text-zinc-500"
                              strokeWidth={2.5}
                            />
                          ) : msg.status === "sent" ||
                            msg.status === "accepted" ? (
                            <Check
                              className="w-3.5 h-3.5 text-zinc-500"
                              strokeWidth={2.5}
                            />
                          ) : msg.status === "failed" ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedErrorMsg(msg);
                              }}
                              className="focus:outline-none hover:scale-110 transition-transform cursor-pointer"
                              title="Falha na entrega pela Meta. Clique para ver detalhes e solução."
                            >
                              <AlertCircle className="w-3.5 h-3.5 text-red-500 hover:text-red-600" />
                            </button>
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-zinc-400" />
                          )}
                        </div>
                      )}
                    </div>
                    {/* Display Reactions */}
                    {msg.reactions &&
                      Array.isArray(msg.reactions) &&
                      msg.reactions.length > 0 && (
                        <div
                          className={`absolute -bottom-2 ${isOutbound ? "right-2" : "left-2"} flex items-center bg-white rounded-full px-1.5 py-0.5 shadow-md border border-zinc-200 z-20 animate-in zoom-in-50 duration-200`}
                        >
                          {msg.reactions.map((r: any, idx: number) => (
                            <span
                              key={idx}
                              className="text-[14px] leading-none"
                              title="Reação"
                            >
                              {r.emoji}
                            </span>
                          ))}
                        </div>
                      )}
                  </div>
                  <div
                    className={`opacity-0 group-hover:opacity-100 transition-opacity self-center px-2 flex flex-col gap-1 ${isOutbound ? "-order-1" : ""}`}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-zinc-400 hover:text-zinc-600"
                      onClick={() => setForwardingMessage(msg)}
                      title="Encaminhar"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-zinc-400 hover:text-zinc-600"
                      onClick={() => setReplyingTo(msg)}
                      title="Responder"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="9 17 4 12 9 7"></polyline>
                        <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
                      </svg>
                    </Button>
                    <Popover>
                      <PopoverTrigger
                        className="inline-flex items-center justify-center shrink-0 h-6 w-6 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100/50 rounded-md outline-none"
                        title="Reagir"
                      >
                        <Smile className="w-3.5 h-3.5" />
                      </PopoverTrigger>
                      <PopoverContent
                        className="p-1 w-auto bg-white border border-zinc-200 shadow-xl rounded-2xl flex flex-row gap-0.5"
                        side="top"
                        sideOffset={10}
                      >
                        {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                          <button
                            key={emoji}
                            className="p-2 cursor-pointer hover:bg-zinc-100 rounded-full flex items-center justify-center outline-none transition-transform hover:scale-125 duration-200"
                            onClick={() => reactToMessage(msg, emoji)}
                          >
                            <span className="text-2xl leading-none select-none">
                              {emoji}
                            </span>
                          </button>
                        ))}
                        <div className="w-[1px] h-6 bg-zinc-200 self-center mx-1" />
                        <Popover>
                          <PopoverTrigger className="p-2 cursor-pointer hover:bg-zinc-100 rounded-full flex items-center justify-center outline-none transition-transform hover:scale-125 duration-200">
                            <Plus className="w-5 h-5 text-zinc-500" />
                          </PopoverTrigger>
                          <PopoverContent
                            className="p-0 border-none shadow-2xl"
                            side="right"
                            align="end"
                            sideOffset={20}
                          >
                            <EmojiPicker
                              theme={Theme.LIGHT}
                              /* @ts-ignore */
                              locale="pt-BR"
                              onEmojiClick={(emojiData: EmojiClickData) =>
                                reactToMessage(msg, emojiData.emoji)
                              }
                              lazyLoadEmojis={true}
                              width={350}
                              height={450}
                            />
                          </PopoverContent>
                        </Popover>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Input Form */}
        <div className="p-3 bg-[#f0f2f5] shrink-0 border-t">
          {!isWindowOpen ? (
            <div className="flex flex-col items-center justify-center p-4 bg-amber-50 border border-amber-100 rounded-lg max-w-4xl mx-auto w-full mb-2">
              <div className="flex items-center text-amber-800 font-medium text-sm mb-2">
                <Clock className="w-4 h-4 mr-2" />
                Janela de 24h fechada
              </div>
              <p className="text-amber-700 text-xs text-center mb-4">
                O cliente não envia mensagens há mais de 24 horas. Para reabrir
                a conversa, você deve enviar um modelo aprovado pela Meta.
              </p>
              <div className="flex gap-4">
                <Button
                  onClick={() => setIsTemplateModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-sm h-9"
                >
                  <CheckSquare className="w-4 h-4 mr-2" />
                  Enviar Modelo Meta
                </Button>
              </div>
            </div>
          ) : contactsCache[conversation.contactId]?.optOut ? (
            <div className="flex bg-zinc-200 text-zinc-600 rounded-lg shadow-sm flex-1 items-center px-4 py-3 justify-center text-sm">
              Este cliente solicitou não receber mais mensagens (Opt-out).
            </div>
          ) : (
            <div className="flex flex-col space-y-2 max-w-4xl mx-auto w-full">
              {replyingTo && (
                <div className="bg-white rounded-lg p-2 px-3 shadow-sm relative flex items-center border-l-4 border-emerald-500 mb-1 z-10 w-full animate-in slide-in-from-top-2">
                  <div className="flex-1 overflow-hidden">
                    <span className="text-xs font-bold text-emerald-600 block mb-0.5">
                      {replyingTo.direction === "outbound"
                        ? "Você"
                        : effectiveName}
                    </span>
                    <p className="text-zinc-600 text-xs truncate whitespace-nowrap">
                      {replyingTo.content}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 ml-2"
                    onClick={() => setReplyingTo(null)}
                  >
                    <X className="w-4 h-4 text-zinc-500" />
                  </Button>
                </div>
              )}
              <form onSubmit={sendMessage} className="flex items-end space-x-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  accept="image/*,video/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                />
                <div className="flex bg-white rounded-lg shadow-sm flex-1 items-center px-1 overflow-visible">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={isUploading}
                      className="inline-flex items-center justify-center shrink-0 h-10 w-10 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Paperclip className="w-5 h-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[200px]">
                      <DropdownMenuItem
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = "image/*,video/*";
                            fileInputRef.current.click();
                          }
                        }}
                      >
                        Fotos e Vídeos
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.accept =
                              "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain";
                            fileInputRef.current.click();
                          }
                        }}
                      >
                        Documento
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = "audio/*";
                            fileInputRef.current.click();
                          }
                        }}
                      >
                        Áudio
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setIsSendContactModalOpen(true)}
                      >
                        Contato
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Input
                    placeholder="Digite uma mensagem"
                    className="flex-1 bg-transparent border-none shadow-none focus-visible:ring-0 px-2 min-h-[44px]"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    autoComplete="off"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex h-10 w-10 items-center justify-center text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-md shrink-0 mr-1 focus:outline-none">
                      <CheckSquare className="w-5 h-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-[300px] max-h-[400px] overflow-y-auto"
                    >
                      <div className="px-2 py-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider sticky top-0 bg-white">
                        Modelos Meta Aprovados
                      </div>
                      {templates.filter((t) => t.status === "APPROVED")
                        .length === 0 && (
                        <div className="px-2 py-4 text-center text-sm text-zinc-500">
                          Nenhum modelo aprovado encontrado.
                        </div>
                      )}
                      {templates
                        .filter((t) => t.status === "APPROVED")
                        .map((t) => (
                          <DropdownMenuItem
                            key={t.id}
                            onClick={() => {
                              setSelectedTemplateForModal(t);
                              setIsTemplateModalOpen(true);
                            }}
                          >
                            <div className="flex flex-col py-1">
                              <span className="font-medium text-sm">
                                {t.name}
                              </span>
                              <span className="text-[10px] text-zinc-400 capitalize">
                                {t.category.toLowerCase()}
                              </span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <Button
                  type="submit"
                  size="icon"
                  className="bg-emerald-600 hover:bg-emerald-700 h-[44px] w-[44px] rounded-full shadow-sm shrink-0"
                  disabled={!newMessage.trim()}
                >
                  <Send className="w-5 h-5 text-white ml-1" />
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar for Context/Tags */}
      <div
        className={clsx(
          "border-l bg-white flex flex-col shrink-0 transition-all duration-300 absolute md:relative right-0 inset-y-0 z-20 shadow-2xl md:shadow-none",
          isDetailsOpen ? "w-full md:w-80" : "w-0 border-l-0 overflow-hidden",
        )}
      >
        <div className="h-16 px-4 border-b flex items-center justify-between bg-white shadow-sm">
          <div className="flex items-center">
            <Info className="w-5 h-5 mr-2 text-zinc-500" />
            <h3 className="font-semibold">Detalhes</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDetailsOpen(false)}
            className="shrink-0 text-zinc-500 hover:text-zinc-700"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="mb-6 p-3 bg-zinc-50 rounded-lg border border-zinc-100">
            <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
              Telefone
            </h4>
            <p className="text-sm font-mono text-zinc-700">{displayPhone}</p>
          </div>

          <div className="mb-6">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center">
              <UserPlus className="w-4 h-4 mr-2" />
              Atribuição
            </h4>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 font-medium">Departamento</label>
                <Select
                  value={conversation.department_id || "none"}
                  onValueChange={changeDepartment}
                >
                  <SelectTrigger className="w-full">
                    <span className="flex flex-1 text-left truncate">
                      {conversation.department_id && conversation.department_id !== "none"
                        ? departments.find(d => d.id === conversation.department_id)?.name || conversation.department_id
                        : "Sem departamento"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem departamento</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-zinc-500 font-medium">Agente</label>
                <Select
                  value={conversation.agent_id || "none"}
                  onValueChange={changeAgent}
                >
                  <SelectTrigger className="w-full">
                    <span className="flex flex-1 text-left truncate">
                      {conversation.agent_id && conversation.agent_id !== "none"
                        ? conversation.agent_id
                        : "Sem agente"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem agente</SelectItem>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.name}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center">
              <Tag className="w-4 h-4 mr-2" />
              Tags e Etiquetas
            </h4>

            <div className="flex flex-wrap gap-2 mb-3">
              {(!conversation.tags || conversation.tags.length === 0) && (
                <span className="text-sm text-zinc-400">Nenhuma tag</span>
              )}
              {conversation.tags?.map((t: string) => {
                const [tName, tColor = "#10b981"] = t.split("::");
                return (
                  <Badge
                    key={t}
                    style={{ color: tColor, borderColor: tColor }}
                    variant="outline"
                    className="flex items-center gap-1 bg-transparent hover:opacity-80"
                  >
                    {tName}
                    <button
                      onClick={() => removeTag(t)}
                      style={{ color: tColor }}
                      className="ml-1 opacity-70 hover:opacity-100 focus:outline-none"
                    >
                      &times;
                    </button>
                  </Badge>
                );
              })}
            </div>

            <form onSubmit={addTag} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Nova tag..."
                  className="h-8 text-sm flex-1"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="h-8"
                >
                  Adicionar
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent shrink-0"
                  />
                  <Input
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="h-7 text-[10px] flex-1 font-mono focus-visible:ring-0"
                    placeholder="#000000"
                  />
                </div>
              </div>
            </form>
          </div>


        </ScrollArea>
      </div>

      {/* Forward Message Dialog */}
      <Dialog
        open={!!forwardingMessage}
        onOpenChange={(open) => {
          if (!open) {
            setForwardingMessage(null);
            setForwardContactSearch("");
            setForwardContactTo("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encaminhar Mensagem</DialogTitle>
            <DialogDescription>
              Pesquise e selecione um contato para enviar a mensagem.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 flex flex-col gap-3">
            <Input
              placeholder="Pesquisar contato por nome ou número..."
              value={forwardContactSearch}
              onChange={(e) => setForwardContactSearch(e.target.value)}
            />
            <ScrollArea className="h-[200px] border rounded-md p-2">
              {filteredForwardContacts.length === 0 ? (
                <div className="text-center p-4 text-sm text-zinc-500">
                  Nenhum contato encontrado
                </div>
              ) : (
                filteredForwardContacts.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer mb-1 ${forwardContactTo === c.whatsapp_id ? "bg-blue-50 border-blue-200" : "hover:bg-zinc-50"}`}
                    onClick={() => setForwardContactTo(c.whatsapp_id)}
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {c.name || "Desconhecido"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatPhone(c.whatsapp_id || c.phone)}
                      </p>
                    </div>
                    {forwardContactTo === c.whatsapp_id && (
                      <Check className="w-4 h-4 text-blue-500" />
                    )}
                  </div>
                ))
              )}
            </ScrollArea>
            <div className="mt-2 p-3 bg-zinc-50 border rounded text-sm text-zinc-600 line-clamp-3">
              {forwardingMessage?.content ||
                `[${forwardingMessage?.type || "Mídia"}]`}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setForwardingMessage(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleForwardMessage}
              disabled={!forwardContactTo || isForwarding}
            >
              {isForwarding ? "Encaminhando..." : "Encaminhar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Contact Dialog */}
      <Dialog
        open={isSendContactModalOpen}
        onOpenChange={(open) => {
          setIsSendContactModalOpen(open);
          if (!open) {
            setSendContactSearch("");
            setSendContactData({ name: "", phone: "" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Contato</DialogTitle>
            <DialogDescription>
              Pesquise e selecione o contato que deseja enviar.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 flex flex-col gap-3">
            <Input
              placeholder="Pesquisar contato por nome ou número..."
              value={sendContactSearch}
              onChange={(e) => setSendContactSearch(e.target.value)}
            />
            <ScrollArea className="h-[200px] border rounded-md p-2">
              {filteredSendContacts.length === 0 ? (
                <div className="text-center p-4 text-sm text-zinc-500">
                  Nenhum contato encontrado
                </div>
              ) : (
                filteredSendContacts.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer mb-1 ${sendContactData.phone === c.whatsapp_id ? "bg-blue-50 border-blue-200" : "hover:bg-zinc-50"}`}
                    onClick={() =>
                      setSendContactData({
                        name: c.name || "Desconhecido",
                        phone: c.whatsapp_id || c.phone,
                      })
                    }
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {c.name || "Desconhecido"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatPhone(c.whatsapp_id || c.phone)}
                      </p>
                    </div>
                    {sendContactData.phone === c.whatsapp_id && (
                      <Check className="w-4 h-4 text-blue-500" />
                    )}
                  </div>
                ))
              )}
            </ScrollArea>
            {sendContactData.name && (
              <div className="mt-2 text-sm text-zinc-600 bg-zinc-50 p-2 border rounded">
                Selecionado: <strong>{sendContactData.name}</strong> (
                {formatPhone(sendContactData.phone)})
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsSendContactModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSendContact}
              disabled={!sendContactData.phone}
            >
              Enviar Contato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Failure / Error Details Dialog */}
      <Dialog
        open={!!selectedErrorMsg}
        onOpenChange={(open) => {
          if (!open) setSelectedErrorMsg(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <DialogTitle className="text-base font-bold text-red-600">
                Falha na Entrega (Meta WhatsApp)
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-zinc-500 pt-1">
              A mensagem foi enviada ao WhatsApp, mas foi rejeitada pelos servidores da Meta.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            if (!selectedErrorMsg?.error_details) {
              return (
                <div className="p-4 bg-zinc-50 border rounded-lg text-sm text-zinc-600">
                  Nenhum detalhe específico retornado pela Meta.
                </div>
              );
            }

            let parsedErrors: any[] = [];
            try {
              const raw =
                typeof selectedErrorMsg.error_details === "string"
                  ? JSON.parse(selectedErrorMsg.error_details)
                  : selectedErrorMsg.error_details;
              parsedErrors = Array.isArray(raw) ? raw : [raw];
            } catch (e) {
              parsedErrors = [{ message: String(selectedErrorMsg.error_details) }];
            }

            return (
              <div className="space-y-3 py-1">
                {parsedErrors.map((err, i) => {
                  const isPaymentIssue =
                    err.code === 131042 ||
                    err.title?.toLowerCase().includes("payment") ||
                    err.title?.toLowerCase().includes("eligibility") ||
                    err.message?.toLowerCase().includes("payment");

                  const is24hIssue =
                    err.code === 131047 ||
                    err.title?.toLowerCase().includes("re-engagement") ||
                    err.message?.toLowerCase().includes("24 hours");

                  const actionHref =
                    err.href ||
                    (err.error_data && err.error_data.details?.match(/https:\/\/[^\s]+/)?.[0]) ||
                    null;

                  return (
                    <div
                      key={i}
                      className="p-3.5 bg-red-50/60 border border-red-200 rounded-xl space-y-2 text-xs text-zinc-800"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-700">
                          {err.title || err.message || "Erro da Meta"}
                        </span>
                        {err.code && (
                          <Badge variant="outline" className="text-[10px] font-mono bg-red-100 text-red-800 border-red-200">
                            Código {err.code}
                          </Badge>
                        )}
                      </div>

                      <p className="text-zinc-600 leading-relaxed">
                        {isPaymentIssue
                          ? "A Meta exige que a forma de pagamento e a moeda da sua conta do WhatsApp Business (WABA) estejam configuradas no Gerenciador de Negócios para permitir disparos de modelos e notificações."
                          : is24hIssue
                          ? "A janela gratuita de 24 horas após a última mensagem do cliente expirou. Envie um Modelo Aprovado (Template) para reabrir a conversa."
                          : err.error_data?.details || err.message || JSON.stringify(err)}
                      </p>

                      {actionHref && (
                        <div className="pt-2 border-t border-red-200/60 flex items-center justify-between">
                          <span className="text-[11px] text-zinc-500">Configurar na Meta:</span>
                          <a
                            href={actionHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm"
                          >
                            Resolver na Meta <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedErrorMsg(null)}
              className="w-full sm:w-auto"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
