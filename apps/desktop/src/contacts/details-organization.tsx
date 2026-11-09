import { Trans, useLingui } from "@lingui/react/macro";
import React, { useState } from "react";

import {
  Buildings,
  MagnifyingGlass,
  MinusCircle,
  Plus,
} from "@syntheo/ui/components/icons";
import {
  AppFloatingPanel,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@syntheo/ui/components/ui/popover";
import { cn } from "@syntheo/utils";

import { createOrganization, type OrganizationRecord } from "./queries";

export function ContactOrganizationSelector({
  onChange: handleChange,
  organization,
  organizations,
  disabled = false,
}: Readonly<{
  onChange: (organizationId: string | null) => void;
  organization: OrganizationRecord | null;
  organizations: OrganizationRecord[];
  disabled?: boolean;
}>) {
  const [open, setOpen] = useState(false);
  const handleRemoveOrganization = () => {
    if (disabled) return;
    handleChange(null);
  };

  return (
    <Popover
      open={disabled ? false : open}
      onOpenChange={(next) => {
        if (!disabled) setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <div
          aria-disabled={disabled || undefined}
          className={cn(
            "hover:bg-accent -mx-2 inline-flex cursor-pointer items-center rounded-lg px-2 py-1 transition-colors",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          {organization?.name ? (
            <div className="flex items-center">
              <span className="text-base md:text-sm">{organization.name}</span>
              <span className="group text-muted-foreground ml-2">
                <MinusCircle
                  className="text-muted-foreground hover:text-destructive size-4 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveOrganization();
                  }}
                />
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1 text-base md:text-sm">
              <Plus className="size-4" />
              <Trans>Add organization</Trans>
            </span>
          )}
        </div>
      </PopoverTrigger>

      <PopoverContent variant="app" align="start" side="bottom">
        <AppFloatingPanel className="p-3">
          <OrganizationControl
            organizations={organizations}
            onChange={handleChange}
            closePopover={() => setOpen(false)}
          />
        </AppFloatingPanel>
      </PopoverContent>
    </Popover>
  );
}

function OrganizationControl({
  organizations: allOrganizations,
  onChange,
  closePopover,
}: Readonly<{
  organizations: OrganizationRecord[];
  onChange: (orgId: string | null) => void;
  closePopover: () => void;
}>) {
  const { t } = useLingui();
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const organizations = searchTerm.trim()
    ? allOrganizations.filter((org) =>
        org.name.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : allOrganizations;

  const showCreateOption = searchTerm.trim() && organizations.length === 0;
  const itemCount = organizations.length + (showCreateOption ? 1 : 0);

  const handleCreateOrganization = async () => {
    try {
      const organizationId = await createOrganization({
        name: searchTerm.trim(),
      });
      onChange(organizationId);
      closePopover();
    } catch (error) {
      console.error("[contacts] failed to create organization", error);
    }
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < itemCount - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : itemCount - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < organizations.length) {
        selectOrganization(organizations[highlightedIndex].id);
      } else if (showCreateOption) {
        void handleCreateOrganization();
      }
    }
  };

  const selectOrganization = (orgId: string) => {
    onChange(orgId);
    closePopover();
  };

  return (
    <div className="flex max-w-[450px] flex-col gap-3">
      <div className="text-muted-foreground text-sm font-medium">
        <Trans>Organization</Trans>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <div className="border-border bg-muted flex w-full items-center gap-2 rounded-xs border px-2 py-1.5">
            <span className="text-muted-foreground shrink-0">
              <MagnifyingGlass className="size-4" />
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setHighlightedIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder={t`Search or add company`}
              className="placeholder:text-muted-foreground w-full bg-transparent text-sm focus:outline-hidden focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          {searchTerm.trim() && (
            <div className="border-border flex w-full flex-col overflow-hidden rounded-xs border">
              {organizations.map((org, index) => (
                <button
                  key={org.id}
                  type="button"
                  className={[
                    "flex items-center px-3 py-2 text-sm text-left transition-colors w-full",
                    highlightedIndex === index ? "bg-muted" : "hover:bg-accent",
                  ].join(" ")}
                  onClick={() => selectOrganization(org.id)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span className="bg-muted mr-2 flex size-5 shrink-0 items-center justify-center rounded-full">
                    <Buildings className="size-3" />
                  </span>
                  <span className="truncate font-medium">{org.name}</span>
                </button>
              ))}

              {showCreateOption && (
                <button
                  type="button"
                  className={[
                    "flex items-center px-3 py-2 text-sm text-left transition-colors w-full",
                    highlightedIndex === organizations.length
                      ? "bg-muted"
                      : "hover:bg-accent",
                  ].join(" ")}
                  onClick={() => void handleCreateOrganization()}
                  onMouseEnter={() => setHighlightedIndex(organizations.length)}
                >
                  <span className="bg-accent mr-2 flex size-5 shrink-0 items-center justify-center rounded-full">
                    <span className="text-xs">+</span>
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1 font-medium">
                    Create{" "}
                    <span className="text-foreground max-w-[140px] truncate">
                      &quot;{searchTerm.trim()}&quot;
                    </span>
                  </span>
                </button>
              )}
            </div>
          )}

          {!searchTerm.trim() && organizations.length > 0 && (
            <div className="custom-scrollbar border-border flex max-h-[40vh] w-full flex-col overflow-hidden overflow-y-auto rounded-xs border">
              {organizations.map((org, index) => (
                <button
                  key={org.id}
                  type="button"
                  className={[
                    "flex items-center px-3 py-2 text-sm text-left transition-colors w-full",
                    highlightedIndex === index ? "bg-muted" : "hover:bg-accent",
                  ].join(" ")}
                  onClick={() => selectOrganization(org.id)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span className="bg-muted mr-2 flex size-5 shrink-0 items-center justify-center rounded-full">
                    <Buildings className="size-3" />
                  </span>
                  <span className="truncate font-medium">{org.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
