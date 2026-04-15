"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Camera, Save, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar } from "@/components/ui/avatar";

interface Profile {
  id: string;
  email: string;
  name: string;
  role: string;
  profileBio: string | null;
  avatarPath: string | null;
}

export function ProfileView() {
  const { update: updateSession } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaved, setPwSaved] = useState(false);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function reload() {
    const r = await fetch("/api/me/profile").then((x) => x.json());
    setProfile(r.user);
    setName(r.user?.name ?? "");
    setBio(r.user?.profileBio ?? "");
  }

  useEffect(() => {
    reload();
  }, []);

  async function saveProfile() {
    setSavingProfile(true);
    setSavedProfile(false);
    const r = await fetch("/api/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, profileBio: bio || null }),
    });
    setSavingProfile(false);
    if (r.ok) {
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2000);
      await updateSession({ name });
      reload();
    }
  }

  async function changePassword() {
    setPwError(null);
    setPwSaved(false);
    const r = await fetch("/api/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword, currentPassword }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setPwError(j.error ?? "Erro ao trocar senha");
      return;
    }
    setPwSaved(true);
    setCurrentPassword("");
    setNewPassword("");
    setTimeout(() => setPwSaved(false), 2000);
  }

  async function uploadAvatar(file: File) {
    setUploadError(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/me/avatar", { method: "POST", body: fd });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setUploadError(j.error ?? "Erro no upload");
      return;
    }
    setAvatarVersion(avatarVersion + 1);
    reload();
  }

  if (!profile) return <p className="text-muted-foreground">Carregando…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-3 max-w-5xl">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Foto de perfil</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <Avatar
            key={avatarVersion}
            userId={profile.id}
            name={profile.name}
            size={140}
            className="ring-4 ring-primary/10"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadAvatar(f);
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Camera className="h-4 w-4" />
            Trocar foto
          </Button>
          {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
          <p className="text-xs text-muted-foreground text-center">
            PNG, JPG ou WEBP — até 2 MB.
          </p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Dados pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input value={profile.email} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Bio</Label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Conte um pouco sobre você (até 280 caracteres)"
              maxLength={280}
            />
            <p className="text-xs text-muted-foreground">{bio.length}/280</p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={saveProfile} disabled={savingProfile}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
            {savedProfile && <span className="text-sm text-success">Salvo!</span>}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Trocar senha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <div className="space-y-1.5">
              <Label>Senha atual</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
              />
            </div>
            <Button onClick={changePassword} disabled={!currentPassword || !newPassword}>
              Trocar senha
            </Button>
          </div>
          {pwError && <p className="text-sm text-destructive mt-2">{pwError}</p>}
          {pwSaved && <p className="text-sm text-success mt-2">Senha trocada!</p>}
        </CardContent>
      </Card>
    </div>
  );
}
