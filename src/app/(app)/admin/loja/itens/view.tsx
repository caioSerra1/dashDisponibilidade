"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, Save, X, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NumberField } from "@/components/ui/number-field";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface Item {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  priceCoins: number;
  stock: number | null;
  featured: boolean;
  sortOrder: number;
  active: boolean;
}

export function LojaItensView() {
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    imageUrl: "",
    priceCoins: 100,
    stock: null as number | null,
    hasStock: false,
    featured: false,
    sortOrder: 0,
  });
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const r = await fetch("/api/admin/store/items").then((x) => x.json());
    setItems(r.items ?? []);
  }

  useEffect(() => {
    reload();
  }, []);

  async function create() {
    setError(null);
    const r = await fetch("/api/admin/store/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        imageUrl: form.imageUrl || null,
        priceCoins: form.priceCoins,
        stock: form.hasStock ? form.stock ?? 0 : null,
        featured: form.featured,
        sortOrder: form.sortOrder,
      }),
    });
    if (!r.ok) {
      setError("Erro ao criar item");
      return;
    }
    setForm({
      name: "",
      description: "",
      imageUrl: "",
      priceCoins: 100,
      stock: null,
      hasStock: false,
      featured: false,
      sortOrder: 0,
    });
    reload();
  }

  async function patch(id: string, data: Partial<Item>) {
    await fetch(`/api/admin/store/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    reload();
  }

  async function remove(id: string) {
    if (!confirm("Excluir este item?")) return;
    await fetch(`/api/admin/store/items/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Novo item da loja
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>URL da imagem (opcional)</Label>
              <Input
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Preço em moedas</Label>
              <NumberField
                value={form.priceCoins}
                onChange={(v) => setForm({ ...form, priceCoins: v })}
                allowDecimals={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ordem de exibição</Label>
              <NumberField
                value={form.sortOrder}
                onChange={(v) => setForm({ ...form, sortOrder: v })}
                allowDecimals={false}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
              <div>
                <Label>Controlar estoque?</Label>
                <p className="text-xs text-muted-foreground">
                  Sem controle = estoque infinito.
                </p>
              </div>
              <Switch
                checked={form.hasStock}
                onCheckedChange={(v) => setForm({ ...form, hasStock: v, stock: v ? 1 : null })}
              />
            </div>
            {form.hasStock && (
              <div className="space-y-1.5">
                <Label>Quantidade em estoque</Label>
                <NumberField
                  value={form.stock ?? 0}
                  onChange={(v) => setForm({ ...form, stock: v })}
                  allowDecimals={false}
                />
              </div>
            )}
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" />
                Destaque na loja
              </Label>
              <Switch
                checked={form.featured}
                onCheckedChange={(v) => setForm({ ...form, featured: v })}
              />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={create} disabled={!form.name || !form.description}>
                Adicionar item
              </Button>
              {error && <span className="ml-3 text-sm text-destructive">{error}</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itens cadastrados ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item ainda.</p>
          ) : (
            <div className="space-y-3">
              {items.map((i) => (
                <ItemRow key={i.id} item={i} onPatch={patch} onRemove={remove} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ItemRow({
  item,
  onPatch,
  onRemove,
}: {
  item: Item;
  onPatch: (id: string, data: Partial<Item> & { stock?: number | null }) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: item.name,
    description: item.description,
    imageUrl: item.imageUrl ?? "",
    priceCoins: item.priceCoins,
    hasStock: item.stock !== null,
    stock: item.stock ?? 0,
    sortOrder: item.sortOrder,
  });
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft({
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl ?? "",
      priceCoins: item.priceCoins,
      hasStock: item.stock !== null,
      stock: item.stock ?? 0,
      sortOrder: item.sortOrder,
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    await onPatch(item.id, {
      name: draft.name,
      description: draft.description,
      imageUrl: draft.imageUrl || null,
      priceCoins: draft.priceCoins,
      stock: draft.hasStock ? draft.stock : null,
      sortOrder: draft.sortOrder,
    });
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-md border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL da imagem</Label>
            <Input
              value={draft.imageUrl}
              onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Descrição</Label>
            <Textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Preço (moedas)</Label>
            <NumberField
              value={draft.priceCoins}
              onChange={(v) => setDraft({ ...draft, priceCoins: v })}
              allowDecimals={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ordem</Label>
            <NumberField
              value={draft.sortOrder}
              onChange={(v) => setDraft({ ...draft, sortOrder: v })}
              allowDecimals={false}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border bg-card p-2 sm:col-span-2">
            <Label className="text-xs">Controlar estoque?</Label>
            <Switch
              checked={draft.hasStock}
              onCheckedChange={(v) => setDraft({ ...draft, hasStock: v })}
            />
          </div>
          {draft.hasStock && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Quantidade em estoque</Label>
              <NumberField
                value={draft.stock}
                onChange={(v) => setDraft({ ...draft, stock: v })}
                allowDecimals={false}
              />
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
            <X className="h-4 w-4" />
            Cancelar
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !draft.name}>
            <Save className="h-4 w-4" />
            Salvar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <div className="h-14 w-14 rounded-md bg-muted overflow-hidden flex-shrink-0">
        {item.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold truncate">{item.name}</p>
          {item.featured && <Badge variant="warning">destaque</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
        <p className="text-xs mt-0.5">
          <strong>{item.priceCoins}</strong> moedas
          {item.stock !== null && ` · ${item.stock} em estoque`}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">destaque</span>
          <Switch
            checked={item.featured}
            onCheckedChange={(v) => onPatch(item.id, { featured: v })}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">ativo</span>
          <Switch
            checked={item.active}
            onCheckedChange={(v) => onPatch(item.id, { active: v })}
          />
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={startEdit} title="Editar">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onRemove(item.id)} title="Excluir">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
