"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { StaffList } from "./_components/staff-list";
import { StaffEditor } from "./_components/staff-editor";
import { StaffDeleteDialog } from "./_components/staff-delete-dialog";

import { useStaffManagement } from "./_hooks/use-staff-management";
export default function StaffPage() {
  const {
    users,
    status,
    error,
    currentUserId,
    editorOpen,
    editing,
    pendingDelete,
    name,
    username,
    password,
    level,
    formError,
    isSaving,
    isDeleting,
    load,
    openCreate,
    openEdit,
    save,
    remove,
    setEditorOpen,
    setPendingDelete,
    setName,
    setUsername,
    setPassword,
    setLevel,
  } = useStaffManagement();
  return (
    <div className="tw04-layout space-y-6 font-sans">
      <PageHeader
        title="Henkilöstö"
        description="Hallitse henkilöstötilejä ja käyttöoikeustasoja."
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden="true" /> Lisää työntekijä
          </Button>
        }
      />

      {status === "loading" ? (
        <LoadingState title="Henkilöstöä ladataan" />
      ) : status === "forbidden" ? (
        <ErrorState
          title="Ei käyttöoikeutta"
          description="Vain ylläpitäjä voi hallita henkilöstötilejä."
        />
      ) : status === "error" ? (
        <ErrorState
          title="Henkilöstöä ei voitu ladata"
          description={error}
          action={<Button onClick={() => void load()}>Yritä uudelleen</Button>}
        />
      ) : users.length === 0 ? (
        <EmptyState
          title="Ei aktiivisia henkilöstötilejä"
          description="Lisää ensimmäinen henkilöstötili."
          action={<Button onClick={openCreate}>Lisää työntekijä</Button>}
        />
      ) : (
        <StaffList
          users={users}
          currentUserId={currentUserId}
          openEdit={openEdit}
          setPendingDelete={setPendingDelete}
        />
      )}

      <StaffEditor
        editorOpen={editorOpen}
        isSaving={isSaving}
        editing={editing}
        name={name}
        username={username}
        password={password}
        level={level}
        formError={formError}
        setEditorOpen={setEditorOpen}
        setName={setName}
        setUsername={setUsername}
        setPassword={setPassword}
        setLevel={setLevel}
        save={save}
      />

      <StaffDeleteDialog
        pendingDelete={pendingDelete}
        isDeleting={isDeleting}
        setPendingDelete={setPendingDelete}
        remove={remove}
      />
    </div>
  );
}
